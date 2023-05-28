import fs from 'fs'
import path from 'path'
import * as tf from '@tensorflow/tfjs-node'
import * as faceapi from '@vladmandic/face-api'

export type FaceMatchParams = {
  minConfidence?: number
  distanceThreshold?: number
  modelPath?: string
  registeredPath: string[]
  useGPU?: boolean
}

export default class FaceMatcher {
  private minConfidence = 0.1
  private distanceThreshold = 0.5
  private modelPath = '../models'
  private registeredImages: string[] = []
  private optionsSSDMobileNet: faceapi.SsdMobilenetv1Options =
    new faceapi.SsdMobilenetv1Options({
      minConfidence: this.minConfidence,
      maxResults: 1,
    })
  private labeledFaceDescriptors: faceapi.LabeledFaceDescriptors[] = []
  private gpuMode = false

  constructor({
    minConfidence,
    distanceThreshold,
    modelPath,
    registeredPath,
    useGPU = false,
  }: FaceMatchParams) {
    if (minConfidence) this.minConfidence = minConfidence
    if (distanceThreshold) this.distanceThreshold = distanceThreshold
    if (modelPath) this.modelPath = modelPath
    if (registeredPath) this.registeredImages = registeredPath
    else registeredPath = []
    this.gpuMode = useGPU
  }

  async initFaceAPI() {
    const modelPath = path.join(__dirname, this.modelPath)
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath)
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath)
    await faceapi.nets.faceExpressionNet.loadFromDisk(modelPath)
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath)
    this.optionsSSDMobileNet = new faceapi.SsdMobilenetv1Options({
      minConfidence: this.minConfidence,
      maxResults: 1,
    })
    await this.registerImages()
  }

  async getDescriptors(imageFile: string) {
    const buffer = fs.readFileSync(imageFile)
    const tensor = (this.gpuMode ? tf : tf).node.decodeImage(buffer, 3)
    const faces = await faceapi
      //@ts-ignore
      .detectAllFaces(tensor, this.optionsSSDMobileNet)
      .withFaceLandmarks()
      .withFaceExpressions()
      .withFaceDescriptors()
    ;(this.gpuMode ? tf : tf).dispose(tensor)
    return faces.map((face) => face.descriptor)
  }

  async registerImage(inputFile: string) {
    if (
      !inputFile.toLowerCase().endsWith('jpg') &&
      !inputFile.toLowerCase().endsWith('png') &&
      !inputFile.toLowerCase().endsWith('gif')
    )
      return
    const descriptors = await this.getDescriptors(inputFile)
    for (const descriptor of descriptors) {
      const labeledFaceDescriptor = new faceapi.LabeledFaceDescriptors(
        inputFile,
        [descriptor],
      )
      this.labeledFaceDescriptors.push(labeledFaceDescriptor)
    }
  }

  private async registerImages() {
    for (const inputFile of this.registeredImages) {
      if (fs.statSync(inputFile).isDirectory()) {
        const files = fs.readdirSync(inputFile)
        for (const file of files) {
          await this.registerImage(path.join(inputFile, file))
        }
      } else {
        await this.registerImage(inputFile)
      }
    }
  }

  async findBestMatch(inputFile: string) {
    const matcher = new faceapi.FaceMatcher(
      this.labeledFaceDescriptors,
      this.distanceThreshold,
    )
    const descriptors = await this.getDescriptors(inputFile)
    const matches: faceapi.FaceMatch[] = []
    for (const descriptor of descriptors) {
      const match = matcher.findBestMatch(descriptor)
      matches.push(match)
    }
    return matches
  }
}
