require('dotenv').config({ path: './.env' });

const operatorFrontdoorPort = process.env.OPERATOR_FRONTDOOR_PORT || '21060';
const adminFrontdoorPort = process.env.ADMIN_FRONTDOOR_PORT || '21061';
const gatewayPort = process.env.INTERNAL_GATEWAY_PORT || '4001';
const dashboardUiPort = process.env.DASHBOARD_UI_PORT || '3002';
const runtimeRoot = process.env.ITDASH_RUNTIME_ROOT || 'C:\\ProgramData\\UAIL\\ITDashboard';

module.exports = {
  apps: [
    {
      name: 'api-gateway',
      script: './api-gateway/dist/index.js',
      env: {
        HOST: '127.0.0.1',
        PORT: gatewayPort,
        DB_PATH: '../data/itdash.db',
        POSTGRES_URL: process.env.POSTGRES_URL,
        POSTGRES_SSL: process.env.POSTGRES_SSL || 'false',
        POSTGRES_PRIMARY_METRICS: process.env.POSTGRES_PRIMARY_METRICS || 'true',
        SECRET_STORE_PASSPHRASE: process.env.SECRET_STORE_PASSPHRASE || process.env.POSTGRES_SECRET_PASSPHRASE,
        POSTGRES_SECRET_PASSPHRASE: process.env.POSTGRES_SECRET_PASSPHRASE,
        APP_ADMIN_LOGIN_ID: process.env.APP_ADMIN_LOGIN_ID || 'admin',
        APP_OPERATOR_LOGIN_ID: process.env.APP_OPERATOR_LOGIN_ID || 'operator',
        ITDASH_RUNTIME_ROOT: runtimeRoot,
        NODE_ENV: 'production'
      }
    },
    {
      name: 'nutanix-collector',
      script: './collectors/nutanix/dist/index.js',
      env: {
        API_URL: `http://127.0.0.1:${gatewayPort}/api/update`
      }
    },
    {
      name: 'solarwinds-collector',
      script: './collectors/solarwinds/dist/index.js',
      env: {
        API_URL: `http://127.0.0.1:${gatewayPort}/api/update`,
        ITDASH_RUNTIME_ROOT: runtimeRoot
      }
    },
    {
      name: 'symphony-collector',
      script: './collectors/symphony/dist/index.js',
      env: {
        API_URL: `http://127.0.0.1:${gatewayPort}/api/update`,
        ITDASH_RUNTIME_ROOT: runtimeRoot
      }
    },
    {
      name: 'dashboard-ui',
      script: '../node_modules/next/dist/bin/next',
      args: `start -H 127.0.0.1 -p ${dashboardUiPort}`,
      cwd: './dashboard',
      env: {
        PORT: dashboardUiPort,
        INTERNAL_GATEWAY_STATUS_URL: `http://127.0.0.1:${gatewayPort}/api/status`,
        INTERNAL_GATEWAY_BASE_URL: `http://127.0.0.1:${gatewayPort}`,
        APP_AUTH_SECRET: process.env.APP_AUTH_SECRET,
        APP_ADMIN_LOGIN_ID: process.env.APP_ADMIN_LOGIN_ID || 'admin',
        APP_OPERATOR_LOGIN_ID: process.env.APP_OPERATOR_LOGIN_ID || 'operator',
        APP_ADMIN_PASSWORD: process.env.APP_ADMIN_PASSWORD || process.env.APP_LOGIN_PASSWORD || '17172737',
        APP_OPERATOR_PASSWORD: process.env.APP_OPERATOR_PASSWORD || process.env.APP_LOGIN_PASSWORD || '17172737',
        APP_LOGIN_PASSWORD: process.env.APP_LOGIN_PASSWORD || '17172737',
        VIEWER_SESSION_DAYS: process.env.VIEWER_SESSION_DAYS || '365',
        ADMIN_SESSION_HOURS: process.env.ADMIN_SESSION_HOURS || '12',
        OPERATOR_FRONTDOOR_PORT: operatorFrontdoorPort,
        ADMIN_FRONTDOOR_PORT: adminFrontdoorPort,
        ITDASH_RUNTIME_ROOT: runtimeRoot,
        NODE_ENV: 'production'
      }
    },
    {
      name: 'dashboard-frontdoor-operator',
      script: './frontdoor-proxy/dist/index.js',
      env: {
        LISTEN_HOST: '0.0.0.0',
        LISTEN_PORT: operatorFrontdoorPort,
        TARGET_ORIGIN: `http://127.0.0.1:${dashboardUiPort}`,
        WS_TARGET_ORIGIN: `http://127.0.0.1:${gatewayPort}`,
        APP_AUTH_SECRET: process.env.APP_AUTH_SECRET,
        ITDASH_SURFACE: 'operator',
        NODE_ENV: 'production'
      }
    },
    {
      name: 'dashboard-frontdoor-admin',
      script: './frontdoor-proxy/dist/index.js',
      env: {
        LISTEN_HOST: '0.0.0.0',
        LISTEN_PORT: adminFrontdoorPort,
        TARGET_ORIGIN: `http://127.0.0.1:${dashboardUiPort}`,
        WS_TARGET_ORIGIN: `http://127.0.0.1:${gatewayPort}`,
        APP_AUTH_SECRET: process.env.APP_AUTH_SECRET,
        ITDASH_SURFACE: 'admin',
        NODE_ENV: 'production'
      }
    }
  ]
};
