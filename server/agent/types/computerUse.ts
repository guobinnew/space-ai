/**
 * Computer Use types
 */

export type ComputerUseStatus = {
  available: boolean
  platform: string
  pythonAvailable: boolean
  setupCompleted: boolean
  version?: string
}

export type SetupResult = {
  success: boolean
  message: string
}
