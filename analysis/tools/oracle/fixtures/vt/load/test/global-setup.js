import { computeSeed } from '../src/seed.js'

export default function setup(project) {
  project.provide('seed', computeSeed(2))
}
