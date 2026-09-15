/* Vercel serverless function: proxies AbstractAPI's Email Reputation check
   so the API key stays server-side instead of sitting in enquire.html's
   client-side JS. Set ABSTRACT_API_KEY in the Vercel project's Environment
   Variables - nothing else to configure. Until it's set, this fails open
   (returns an empty result) so the enquiry form keeps working unchecked. */
module.exports = async (req, res) => {
  const email = (req.query.email || "").toString().trim();
  if (!email) {
    res.status(400).json({ error: "Missing email" });
    return;
  }

  const apiKey = process.env.ABSTRACT_API_KEY;
  if (!apiKey) {
    res.status(200).json({});
    return;
  }

  try {
    const url = "https://emailreputation.abstractapi.com/v1/?api_key=" +
      encodeURIComponent(apiKey) + "&email=" + encodeURIComponent(email);
    const apiRes = await fetch(url);
    const data = await apiRes.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json({});
  }
};
