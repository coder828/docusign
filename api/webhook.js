import docusign from 'docusign-esign';
const { ApiClient, EnvelopesApi } = docusign;

import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const config = {
  api: {
    bodyParser: false // DocuSign sends raw body XML/JSON
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error('Invalid JSON in webhook payload');
    return res.status(400).send('Invalid JSON');
  }

  const envelopeId = payload?.data?.envelopeId;
  const status = payload?.data?.envelopeSummary?.status?.toLowerCase();

  if (!envelopeId || status !== 'completed') {
    console.warn('Webhook ignored: missing envelopeId or not completed');
    return res.status(200).send('Ignored');
  }

  try {
    // Authenticate via JWT
    const apiClient = new ApiClient();
    apiClient.setBasePath('https://account.docusign.com');

    const jwt = await apiClient.requestJWTUserToken(
      process.env.DOCUSIGN_CLIENT_ID,
      process.env.DOCUSIGN_USER_ID,
      'signature',
      process.env.DOCUSIGN_PRIVATE_KEY,
      3600
    );

    const accessToken = jwt.body.access_token;

    // Switch to NA4 production API base path
    apiClient.setBasePath('https://na4.docusign.net/restapi');
    apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

    const userInfo = await apiClient.getUserInfo(accessToken);
    const accountId = userInfo.accounts[0].accountId;

    const envelopesApi = new EnvelopesApi(apiClient);

    // Get the userEmail from custom fields
    const envelopeDetails = await envelopesApi.getEnvelope(accountId, envelopeId, {
      include: 'custom_fields'
    });

    const userEmail = envelopeDetails?.customFields?.textCustomFields?.find(
      f => f.name === 'userEmail'
    )?.value;

    if (!userEmail) {
      console.error('User email not found in envelope custom fields');
      return res.status(200).send('Missing user email');
    }

    // Get signed document
    // const pdfBuffer = await envelopesApi.getDocument(accountId, envelopeId, 'combined', null); // kept getting corrupted PDF in attachments
    const pdfRaw = await envelopesApi.getDocument(accountId, envelopeId, 'combined');
    const pdfBuffer = Buffer.from(pdfRaw, 'binary');
    
    // console.log(Buffer.isBuffer(pdfBuffer)); // ensure a Buffer is returned

    const attachment = {
      content: Buffer.from(pdfBuffer).toString('base64'),
      filename: 'Leading-Peers-Completed-Membership-Agreement.pdf',
      type: 'application/pdf',
      disposition: 'attachment'
    };

    await sgMail.send({
      to: userEmail,
      from: 'info@mail.leadingpeers.com',
      subject: 'Leading Peers - Completed Membership Application',
      text: `Thank you for sending your application for Leading Peers. The signed Terms of Service is attached for your records. 

– Leading Peers`,
      attachments: [attachment]
    });

    console.log(`✅ Sent signed document to ${userEmail}`);
    return res.status(200).send('Email sent');
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).send('Webhook error');
  }
}
