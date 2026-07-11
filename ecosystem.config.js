module.exports = {
  apps: [
    {
      name: 'api-gateway',
      script: './api-gateway/dist/index.js',
      env: {
        PORT: 4000,
        DB_PATH: '../data/itdash.db',
        NODE_ENV: 'production'
      }
    },
    {
      name: 'nutanix-collector',
      script: './collectors/nutanix/dist/index.js',
      env: {
        API_URL: 'http://localhost:4000/api/update'
      }
    },
    {
      name: 'solarwinds-collector',
      script: './collectors/solarwinds/dist/index.js',
      env: {
        API_URL: 'http://localhost:4000/api/update'
      }
    },
    {
      name: 'symphony-collector',
      script: './collectors/symphony/dist/index.js',
      env: {
        API_URL: 'http://localhost:4000/api/update'
      }
    },
    {
      name: 'dashboard-ui',
      script: '../node_modules/next/dist/bin/next',
      args: 'dev',
      cwd: './dashboard',
      env: {
        PORT: 3000,
        NEXT_PUBLIC_API_URL: 'http://localhost:4000'
      }
    }
  ]
};
