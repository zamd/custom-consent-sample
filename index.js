const Hapi = require('hapi');
const fetch = require('node-fetch');
const crypto = require('crypto');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const defaultConfig = {
  host: 'loopback.com',
  port: 9009,
  domain: 'atlassian.local.dev.auth0.com',
  client_id: 'TVMddq94YUiqqOtRBnC3exVTP01C7du5',
  redirect_uri: 'http://loopback.com:9009',
  audience: 'https://edge.atlassian.com',
  scope: 'manage:participants',
  introspectEndpoint: `https://atlassian.local.dev.auth0.com/state/introspect`,
  decisionEndpoint: `https://atlassian.local.dev.auth0.com/decision`,
  globalClientSecret: 'StvHIhw1Vu0ZrB5sPgRn850H6CLuXwV8UQcsNARHgZe87-F7xYL_g3tFTFhk4LTN'
}

process.env = Object.assign({}, defaultConfig, process.env);

const server = new Hapi.Server({
    host: process.env.host,
    port: process.env.port,
    debug: {request: '*'}
});

function generateBearerToken(state,key) {
  const hash = crypto.createHmac("sha256",key).update(state).digest().toString('base64');
  return "axs.alpha."+ state + "." + hash;
}

async function introspectState(state) {
  const {introspectEndpoint, globalClientSecret} = process.env;
  const token = generateBearerToken(state,globalClientSecret);

  const response = await fetch(introspectEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
      });
  const json = await response.json();
  if (json.error)
    throw new Error(json.error)

  return json;
}
async function main() {

  const {domain,client_id,redirect_uri,audience,scope} = process.env;
  server.route({
    method: 'GET',
    path: '/',
    handler: (req,h) => {
      if (!req.query.code)
          return h.redirect(`https://${domain}/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&audience=${audience}&scope=${scope}&response_type=code&prompt=consent`);
      return h.view('loggedIn', {code: req.query.code});
    }
  })
  server.route({
      method: 'GET',
      path: '/oauth2/consent',
      handler: async (req,h) => {
        req.log('starting consent processing...');
          if (!req.query.state)
              return h.redirect(`/error?description=no state provided.`);
          try {
              req.log('introspecting state...');
              const consent = await introspectState(req.query.state);
              req.log(['debug', 'transaction details'],consent);
              const viewModel = Object.assign({},consent, {decision: process.env.decisionEndpoint, state: req.query.state});
              return h.view('home', viewModel);
          }
          catch(err) {
              req.log(['error',,err.toString()]);
              return h.redirect(`/error?description=${err.toString()}`);
          }
      }
  });

  server.route({
      method: 'GET',
      path: '/error',
      handler: (req,h) => {
          return h.view('error', {description: req.query.description})
      }
  });


  await server.register(require('vision'));
  await server.views({
      engines: {
          hbs: require('handlebars')
      },
      path: 'views',
  });

  await server.start()

  console.log(server.info.uri);
}



main();
