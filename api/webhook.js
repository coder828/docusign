import docusign from 'docusign-esign';
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const config = {
  api: {
    bodyParser: false // Required for DocuSign's webhook payload format
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Parse raw body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');

  console.log('RAW BODY:', rawBody);

  const envelopeIdMatch = rawBody.match(/<EnvelopeID>(.+?)<\/EnvelopeID>/);
  const statusMatch = rawBody.match(/<Status>(.+?)<\/Status>/);

  if (!envelopeIdMatch || !statusMatch) {
    console.error('Invalid webhook payload');
    return res.status(400).send('Invalid DocuSign Webhook');
  }

  const envelopeId = envelopeIdMatch[1];
  const status = statusMatch[1];

  if (status.toLowerCase() !== 'completed') return res.status(200).send('Ignored non-completed envelope');

  try {
    // DocuSign Auth
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath('https://demo.docusign.net/restapi');
    const jwt = await apiClient.requestJWTUserToken(
      process.env.DOCUSIGN_CLIENT_ID,
      process.env.DOCUSIGN_USER_ID,
      'signature',
      process.env.DOCUSIGN_PRIVATE_KEY,
      3600
    );
    const accessToken = jwt.body.access_token;
    apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

    const userInfo = await apiClient.getUserInfo(accessToken);
    const accountId = userInfo.accounts[0].accountId;
    const envelopesApi = new docusign.EnvelopesApi(apiClient);

    // Get userEmail from custom fields
    const envelopeDetails = await envelopesApi.getEnvelope(accountId, envelopeId);
    const userEmail = envelopeDetails?.customFields?.textCustomFields?.find(f => f.name === 'userEmail')?.value;

    if (!userEmail) {
      console.error('User email missing in envelope custom fields');
      return res.status(400).send('Missing userEmail');
    }

    // Get the signed document
    const pdfBuffer = await envelopesApi.getDocument(accountId, envelopeId, 'combined', null);

    // Send via SendGrid
    await sgMail.send({
      to: userEmail,
      from: 'info@mail.leadingpeers.com',
      subject: 'Your Signed Document',
      text: 'Hi, attached is your signed membership agreement.',
      attachments: [{
        content: pdfBuffer.toString('base64'),
        filename: 'SignedMembershipAgreement.pdf',
        type: 'application/pdf',
        disposition: 'attachment'
      }]
    });

    console.log(`✅ Sent signed doc to ${userEmail}`);
    return res.status(200).send('Email sent');
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).send('Webhook processing failed');
  }
}
