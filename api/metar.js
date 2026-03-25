export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { hours = 24 } = req.query;

  try {
    const response = await fetch(`https://aviationweather.gov/api/data/metar?ids=KSEA&format=json&hours=${hours}`);
    
    if (!response.ok) {
      throw new Error(`aviationweather.gov API error: ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('METAR fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch METAR data',
      message: error.message 
    });
  }
}
