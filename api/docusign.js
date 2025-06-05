import docusign from 'docusign-esign';

export default async function handler(req, res) {
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
  const templateId = '223a640a-9565-4d84-bd3d-08f917100a27'; // Template ID for Membership Agreement
  const roleName = 'LP Member:'; // Role Name

  const basePath = environment === 'demo'
    ? 'https://demo.docusign.net/restapi'
    : 'https://www.docusign.net/restapi';

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
        // tabs: { textTabs: [{ tabLabel: "MyField", value: "Prefill Value" }] } // Optional, if you want to prefill fields
      }
    ];

    // Create the envelope
    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const envelope = await envelopesApi.createEnvelope(accountId, { envelopeDefinition });
    const envelopeId = envelope.envelopeId;

    // Create embedded signing view (recipient view)
    const viewRequest = new docusign.RecipientViewRequest();
    viewRequest.returnUrl = 'https://yourwixsite.com/thank-you'; // Change to your post-signing page
    viewRequest.authenticationMethod = 'none';
    viewRequest.email = email;
    viewRequest.userName = name;
    viewRequest.clientUserId = '123'; // Must match clientUserId above
    viewRequest.recipientId = '1';

    const viewUrl = await envelopesApi.createRecipientView(accountId, envelopeId, { recipientViewRequest: viewRequest });

    res.status(200).json({ signingUrl: viewUrl.url });
  } catch (error) {
    // Improved error output for debugging
    console.error('DocuSign Error:', error.response ? error.response.body : error);
    res.status(500).json({ error: 'Failed to create DocuSign envelope or signing URL.' });
  }
}
