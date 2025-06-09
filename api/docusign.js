import docusign from 'docusign-esign';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://www.leadingpeers.com'); // or '*' for public
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  const { name, email } = req.body;
  if (!name || !email) {
    res.status(400).json({ error: 'Missing name or email' });
    return;
  }

  // Env vars for DocuSign API
  const integratorKey = process.env.DOCUSIGN_CLIENT_ID;
  const userId = process.env.DOCUSIGN_USER_ID;
  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY;
  const environment = process.env.DOCUSIGN_ENVIRONMENT || 'demo';
  const templateId = '887d4b49-73c0-4f5d-afa3-b5fbbff485cc'; // Template ID for Membership Agreement & Terms of Service (Diane Account)
  const roleName = 'LP Member:'; // Role Name

  const basePath = environment === 'demo'
    ? 'https://demo.docusign.net/restapi'
    : 'https://na4.docusign.net/restapi';

  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(basePath);

  try {
    // Authenticate via JWT
    const results = await apiClient.requestJWTUserToken(
      integratorKey,
      userId,
      'signature',
      privateKey,
      3600
    );
    const accessToken = results.body.access_token;

    apiClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

    // Get account ID
    const userInfo = await apiClient.getUserInfo(accessToken);
    const accountId = userInfo.accounts[0].accountId;

    // Create envelope from template
    const envelopeDefinition = new docusign.EnvelopeDefinition();
    envelopeDefinition.templateId = templateId;
    envelopeDefinition.status = 'sent';

    envelopeDefinition.templateRoles = [
      {
        email: email,
        name: name,
        roleName: roleName,
        clientUserId: '123', // Required for embedded signing. Can be any string.
      }
    ];

    // Create the envelope
    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const envelope = await envelopesApi.createEnvelope(accountId, { envelopeDefinition });
    const envelopeId = envelope.envelopeId;

    // Create embedded signing view (recipient view)
    const viewRequest = new docusign.RecipientViewRequest();
    viewRequest.returnUrl = 'https://www.leadingpeers.com/membership-confirmation';
    viewRequest.authenticationMethod = 'none';
    viewRequest.email = email;
    viewRequest.userName = name;
    viewRequest.clientUserId = '123'; // Must match clientUserId above
    viewRequest.recipientId = '1';

    const viewUrl = await envelopesApi.createRecipientView(accountId, envelopeId, { recipientViewRequest: viewRequest });

    res.status(200).json({ signingUrl: viewUrl.url });
  } catch (error) {
    console.error('DocuSign Error:', error, error.response ? error.response.body : '');
    res.status(500).json({
      error: 'Failed to create DocuSign envelope or signing URL.',
      docusignError: error.response ? error.response.body : error.message || error
    });
  }
}
