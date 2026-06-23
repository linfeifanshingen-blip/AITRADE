import { getFutuConnectionStatus } from '@/lib/futu';

export default async function handler(req, res) {
  const login = String(req.query.login || '').toLowerCase();
  const shouldLogin = login === '1' || login === 'true' || login === 'yes';

  try {
    const status = await getFutuConnectionStatus({ login: shouldLogin });
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({
      enabled: false,
      tcpReachable: false,
      sdkLogin: false,
      message: error?.message || String(error),
    });
  }
}
