import { Webhooks } from "@octokit/webhooks";
import express from 'express';
import dotenv from 'dotenv'
import { exec } from 'child_process'

dotenv.config()

const app = express()
const port = process.env.UPDATER_PORT
const appDir = process.env.APP_DIR

const webhooks = new Webhooks({
  secret: process.env.SECRET as string,
});

app.post('/', async (req, res) => {
  console.log('Received request:', req.headers)

  const signature = req.headers["x-hub-signature-256"];

  if (!signature) {
    console.error('No signature provided')
    res.status(401).send('Unauthorized')
    return
  }

  let body = ''
  req.on('data', chunk => {
    body += chunk.toString()
  })

  req.on('end', async () => {
    if (!(await webhooks.verify(body, signature as string))) {
      console.error('Invalid signature')
      res.status(401).send('Unauthorized')
      return
    }

    let jsonData = null

    try {
      jsonData = JSON.parse(body)

      if (!jsonData) {
        console.error('No JSON data provided')
        res.status(400).send('Bad Request')
        return
      }

      if (!jsonData.action || (jsonData.action !== 'completed' && jsonData.action !== 'in_progress') || (jsonData.action !== 'in_progress' && jsonData.workflow_run.conclusion !== 'success')) {
        console.error('Invalid action or conclusion')
        res.status(202).send('Ignored. Wrong action or conclusion.')
        return
      }

      exec(`docker compose -f ${appDir}/docker-compose.yml down && docker compose -f ${appDir}/docker-compose.yml up -d`, { cwd: appDir }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing command: ${error.message}`)
          return
        }
        if (stderr) {
          console.error(`stderr: ${stderr}`)
          return
        }
        console.log(`stdout: ${stdout}`)
      });
    }
    catch (error) {
      console.error('Error parsing JSON:', error)
      res.status(400).send('Invalid JSON')
      return
    }

    res.status(200).send()
  })
})

app.listen(port, () => {
  console.log(`PasteBook auto updater listening on port ${port}`)

  console.log(`Webhook secret: ${process.env.SECRET}`)
})
