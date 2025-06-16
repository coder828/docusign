import docusign from 'docusign-esign';
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export const config = {
  api: {
    bodyParser: false // Required to read raw payload from DocuSign
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
    // Step 1: Get JWT access token
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath('https://account.docusign.com');

    const jwt = await apiClient.requestJWTUserToken(
      process.env.DOCUSIGN_CLIENT_ID,
      process.env.DOCUSIGN_USER_ID,
      'signature',
      process.env.DOCUSIGN_PRIVATE_KEY,
      3600
    );

    const accessToken = jwt.body.access_token;
    apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

    // Step 2: Set fixed base URI (na4) and get account ID dynamically
    apiClient.setBasePath('https://na4.docusign.net/restapi');

    const userInfo = await apiClient.getUserInfo(accessToken);
    const accountId = userInfo.accounts[0].accountId;

    const envelopesApi = new docusign.EnvelopesApi(apiClient);

    // Step 3: Fetch envelope details and extract userEmail from custom fields
    const envelopeDetails = await envelopesApi.getEnvelope(accountId, envelopeId, { include: 'custom_fields' });
    const userEmail = envelopeDetails?.customFields?.textCustomFields?.find(
      f => f.name === 'userEmail'
    )?.value;

    if (!userEmail) {
      console.error('User email not found in envelope custom fields');
      return res.status(200).send('Missing user email');
    }

    // Step 4: Download the signed document as PDF
    const pdfBuffer = await envelopesApi.getDocument(accountId, envelopeId, 'combined', null);

    console.log('Sending email with:', {
      to: userEmail,
      from: 'info@mail.leadingpeers.com',
      subject: 'Your Signed Membership Agreement',
      text: 'Hi, attached is your signed membership agreement. Please keep it for your records.',
      attachments: [
        {
          filename: 'SignedMembershipAgreement.pdf',
          type: 'application/pdf',
          disposition: 'attachment',
          content: pdfBuffer.toString('base64').slice(0, 100) + '... (truncated)'
        }
      ]
    });

    // Step 5: Send email with the signed document attached
    await sgMail.send({
      to: userEmail,
      from: 'info@mail.leadingpeers.com',
      subject: 'Your Signed Membership Agreement',
      text: 'Hi, attached is your signed membership agreement. Please keep it for your records.',
      attachments: [
        {
          content: pdfBuffer.toString('base64'),
          filename: 'SignedMembershipAgreement.pdf',
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    });

    console.log(`✅ Sent signed document to ${userEmail}`);
    return res.status(200).send('Email sent');
  } catch (err) {
    console.error('Webhook processing error:', err);
    return res.status(500).send('Webhook error');
  }
}
