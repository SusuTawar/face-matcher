import express, { json } from 'express'
import FaceMatcher from './face-api'
import path from 'path'
import fileUpload from 'express-fileupload'
import fs from 'fs'
import sharp from 'sharp'
import { nanoid } from 'nanoid'
import { v4 as uuid } from 'uuid'
import { PrismaClient } from '@prisma/client'
import { DateTime } from 'luxon'
import { CronJob } from 'cron'
;(async () => {
  const app = express()
  const prisma = new PrismaClient()

  const faceMatch = new FaceMatcher({
    registeredPath: [path.join(__dirname, '../faces')],
  })
  await faceMatch.initFaceAPI()

  app.use(json())
  app.use(fileUpload())

  app.get('/ping', (_req, res) => {
    res.send({
      message: 'pong',
      status: true,
    })
  })

  app.post('/register', async (req, res) => {
    const file = req.files?.file
    const name = req.body.id

    const reqFiles = Array.isArray(file) ? file : [file]

    if (!file || !name) {
      res.status(400).send({
        message: 'Invalid request',
        status: false,
      })
      return
    }

    const files = fs
      .readdirSync(path.join(__dirname, '../faces'))
      .filter((f) => f.startsWith(`${name}_`))
    let fileOk = 0
    for (let i = 0; i < reqFiles.length; i++) {
      const reqFile = reqFiles[i]
      if (!reqFile || !reqFile.mimetype.startsWith('image/')) {
        continue
      }
      const jpeg = await sharp(reqFile.data).jpeg({ quality: 80 }).toBuffer()
      const nextNumber = `${files.length + i + 1}`.padStart(4, '0')
      const fileName = `${name}_${nextNumber}.jpg`
      const filePath = path.join(__dirname, '../faces', fileName)
      fs.writeFileSync(filePath, jpeg)
      faceMatch.registerImage(filePath)
      fileOk++
    }
    if (fileOk === 0) {
      res.status(400).send({
        message: 'None of the files are valid',
        status: false,
      })
      return
    }
    const message =
      fileOk === reqFiles.length
        ? `${fileOk} file(s) successfully registered`
        : `${fileOk} file(s) out of ${req.files} successfully registered`
    return res.send({
      message,
      status: true,
    })
  })

  // DDc7KX
  app.post('/match', async (req, res) => {
    let file = req.files?.file
    if (!file) {
      res.status(400).send({
        message: 'File required',
        status: false,
      })
      return
    }

    if (Array.isArray(file)) {
      file = file.find((f) => f.mimetype.startsWith('image/'))
    }

    if (!file) {
      res.status(400).send({
        message: 'Invalid file',
        status: false,
      })
      return
    }

    const jpeg = await sharp(file.data).jpeg({ quality: 80 }).toBuffer()
    const tempName = path.join(__dirname, '../temp', uuid() + file.name)
    fs.writeFileSync(tempName, jpeg)
    const bestMatch = await faceMatch.findBestMatch(tempName)

    const tomorrow = DateTime.now().plus({ days: 1 })

    const match = await prisma.matches.create({
      data: {
        id: nanoid(12),
        filePath: tempName,
        expires: tomorrow.toJSDate(),
      },
    })

    const matchPath = bestMatch[0].label
    if (matchPath === 'unknown') {
      res.status(404).send({
        message: 'No match found',
        status: false,
      })
      return
    }
    const fileName = path.basename(matchPath).split('_')[0]

    const id = req.body.id
    if ((id || id === 0) && id !== fileName) {
      res.status(404).send({
        message: `${id} doesn't match with the provided image`,
        status: false,
      })
      return
    }

    return res.send({
      message: 'Match found',
      data: {
        match: fileName,
        requestId: match.id,
      },
      status: true,
    })
  })

  app.get('/complaint/:id/:changeTo', async (req, res) => {
    const reqId = req.params.id
    const changeTo = req.params.changeTo

    if (!reqId || !changeTo) {
      res.status(400).send({
        message: 'Invalid request',
        status: false,
      })
      return
    }

    const complaint = await prisma.matches.findUnique({ where: { id: reqId } })
    if (!complaint) {
      res.status(404).send({
        message: 'Request with that id not found or expired',
        status: false,
      })
      return
    }

    const files = fs
      .readdirSync(path.join(__dirname, '../faces'))
      .filter((f) => f.startsWith(`${changeTo}_`))
    const nextNumber = `${files.length + 1}`.padStart(4, '0')
    const newFile = `${changeTo}_${nextNumber}.jpg`
    const oldFile = complaint.filePath
    fs.renameSync(oldFile, path.join(__dirname, '../faces', newFile))
    faceMatch.registerImage(path.join(__dirname, '../faces', newFile))

    await prisma.complaintHistory.create({
      data: {
        id: undefined,
        file: newFile,
        requestId: reqId,
      },
    })
    await prisma.matches.delete({ where: { id: reqId } })

    res.send({
      message: `Complaint resolved and will be used for future matches to ${changeTo}`,
      status: true,
    })
  })

  app.listen(3000, () => {
    console.log('Server running on port 3000')
  })

  new CronJob(
    '* * * * * 0',
    async () => {
      const prisma = new PrismaClient()
      const complaints = await prisma.matches.findMany({
        where: { expires: { lte: new Date() } },
      })
      if (complaints.length)
        console.log(
          `[${DateTime.now().toFormat('yyyy/LL/dd hh:mm:ss')}][CRON] Deleting ${
            complaints.length
          } expired complaints`,
        )
      for (const complaint of complaints) {
        fs.unlinkSync(complaint.filePath)
        await prisma.matches.delete({ where: { id: complaint.id } })
      }
    },
    null,
    true,
    'Asia/Jakarta',
  )
})()
