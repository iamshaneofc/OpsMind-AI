module.exports = {
  "apps": [
    {
      "name": "srl-bot",
      "script": "npm",
      "args": "start",
      "cwd": "/root/srlbotai",
      "env": {
        "NODE_ENV": "production",
        "USE_SQL_SERVER_DATA": "true",
        "SQL_SERVER_HOST": "157.119.203.167",
        "SQL_SERVER_PORT": "1433",
        "SQL_SERVER_USER": "AiLogin",
        "SQL_SERVER_PASSWORD": "Si$co@889!",
        "SQL_SERVER_DATABASE": "SiscoERP_Data",
        "SQL_SERVER_ENCRYPT": "false",
        "SQL_SERVER_TRUST_SERVER_CERTIFICATE": "true"
      }
    }
  ]
}