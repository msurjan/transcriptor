// Función serverless de Vercel: arma config.js al vuelo desde las variables
// de entorno del proyecto (SUPABASE_URL, SUPABASE_ANON_KEY), para que la
// clave nunca quede committeada en el repo. En desarrollo local esto no
// corre — ahí se usa un web/config.js real (ver web/config.example.js).
module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.status(200).send(
    `window.APP_CONFIG = ${JSON.stringify({
      SUPABASE_URL: process.env.SUPABASE_URL || "",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
    })};`
  );
};
