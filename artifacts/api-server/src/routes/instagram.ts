import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const APP_ID = process.env.INSTAGRAM_APP_ID!;
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET!;
const REDIRECT_URI = "https://desigram-itsgajendrasingh5.replit.app/api/auth/instagram/callback";
const SCOPES = "instagram_basic,instagram_content_publish,instagram_manage_insights";

router.get("/auth/instagram", (_req: Request, res: Response) => {
  if (!APP_ID) {
    res.status(500).json({ error: "INSTAGRAM_APP_ID is not configured" });
    return;
  }
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    response_type: "code",
  });
  const authUrl = `https://api.instagram.com/oauth/authorize?${params.toString()}`;
  res.redirect(authUrl);
});

router.get("/auth/instagram/callback", async (req: Request, res: Response) => {
  const { code, error, error_reason, error_description } = req.query as Record<string, string>;

  if (error) {
    res.status(400).json({ error, error_reason, error_description });
    return;
  }

  if (!code) {
    res.status(400).json({ error: "No authorization code received" });
    return;
  }

  try {
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        code,
      }).toString(),
    });

    const tokenData = await tokenRes.json() as Record<string, unknown>;

    if (!tokenRes.ok || tokenData.error_type) {
      res.status(400).json({ error: "Failed to exchange code for token", details: tokenData });
      return;
    }

    const shortToken = tokenData.access_token as string;
    const userId = tokenData.user_id;

    const longTokenRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET}&access_token=${shortToken}`
    );
    const longTokenData = await longTokenRes.json() as Record<string, unknown>;

    res.json({
      success: true,
      user_id: userId,
      access_token: longTokenData.access_token ?? shortToken,
      token_type: longTokenData.token_type ?? "bearer",
      expires_in: longTokenData.expires_in ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal error during token exchange", details: String(err) });
  }
});

router.get("/instagram/me", async (_req: Request, res: Response) => {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: "INSTAGRAM_ACCESS_TOKEN is not configured" });
    return;
  }
  try {
    const profileRes = await fetch(
      `https://graph.instagram.com/me?fields=id,username,account_type,media_count&access_token=${token}`
    );
    const data = await profileRes.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch Instagram profile", details: String(err) });
  }
});

router.get("/instagram/media", async (_req: Request, res: Response) => {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: "INSTAGRAM_ACCESS_TOKEN is not configured" });
    return;
  }
  try {
    const mediaRes = await fetch(
      `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&access_token=${token}`
    );
    const data = await mediaRes.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch Instagram media", details: String(err) });
  }
});

export default router;
