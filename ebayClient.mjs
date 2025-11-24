// ebayClient.mjs
import querystring from 'querystring';

const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID;
const EBAY_SCOPE =
  process.env.EBAY_SCOPE || 'https://api.ebay.com/oauth/api_scope';
const EBAY_MARKETPLACE_ID =
  process.env.EBAY_MARKETPLACE_ID || 'EBAY_GB';

// --- Affiliate config ---
const EBAY_CAMPAIGN_ID = '5339109462';
const EBAY_CUSTOM_ID = 'findanyvinyl';

let cachedToken = null;
let tokenExpiresAt = 0; // ms since epoch

function withAffiliateParams(rawUrl) {
  if (!rawUrl) return rawUrl;

  try {
    const url = new URL(rawUrl);

    // ensure your campaign + custom id are always present
    url.searchParams.set('campid', EBAY_CAMPAIGN_ID);
    url.searchParams.set('customid', EBAY_CUSTOM_ID);

    return url.toString();
  } catch (e) {
    // if URL parsing fails for any reason, just return original
    console.error('Error appending affiliate params to URL:', rawUrl, e);
    return rawUrl;
  }
}

async function getAppToken() {
  const now = Date.now();

  // reuse token if still valid (with 60s buffer)
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const body = querystring.stringify({
    grant_type: 'client_credentials',
    scope: EBAY_SCOPE,
  });

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString('base64'),
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token error ${res.status}: ${text}`);
  }

  const data = await res.json();

  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;

  return cachedToken;
}

export async function searchEbayVinyl(query, limit = 20) {
  const token = await getAppToken();

  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    // eBay category for Vinyl Records
    category_ids: '176985',
  });

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay search error ${res.status}: ${text}`);
  }

  const data = await res.json();

  return (data.itemSummaries || []).map((item) => ({
    id: item.itemId,
    title: item.title,
    price: item.price?.value,
    currency: item.price?.currency,
    condition: item.condition,
    image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl,
    url: withAffiliateParams(item.itemWebUrl), // 👈 now includes campid/customid
    seller: item.seller?.username,
  }));
}
