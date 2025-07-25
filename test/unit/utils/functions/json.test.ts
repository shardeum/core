import { readJSON, readJSONDir } from '../../../../src/utils/functions/json'
import { Utils } from '@shardeum-foundation/lib-types'
import * as fs from 'fs'
import * as path from 'path'

jest.mock('fs')
jest.mock('@shardeum-foundation/lib-types')

const mockFs = fs as jest.Mocked<typeof fs>
const mockUtils = Utils as jest.Mocked<typeof Utils>

describe('json utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('readJSON', () => {
    it('should read and parse a JSON file', () => {
      const mockFileContent = '{"key": "value", "number": 42}'
      const expectedObject = { key: 'value', number: 42 }

      mockFs.readFileSync.mockReturnValue(Buffer.from(mockFileContent))
      mockUtils.safeJsonParse.mockReturnValue(expectedObject)

      const result = readJSON<typeof expectedObject>('test.json')

      expect(mockFs.readFileSync).toHaveBeenCalledWith('test.json')
      expect(mockUtils.safeJsonParse).toHaveBeenCalledWith(mockFileContent)
      expect(result).toEqual(expectedObject)
    })

    it('should handle empty JSON file', () => {
      const mockFileContent = '{}'
      const expectedObject = {}

      mockFs.readFileSync.mockReturnValue(Buffer.from(mockFileContent))
      mockUtils.safeJsonParse.mockReturnValue(expectedObject)

      const result = readJSON('empty.json')

      expect(mockFs.readFileSync).toHaveBeenCalledWith('empty.json')
      expect(mockUtils.safeJsonParse).toHaveBeenCalledWith(mockFileContent)
      expect(result).toEqual(expectedObject)
    })

    it('should handle JSON arrays', () => {
      const mockFileContent = '[1, 2, 3]'
      const expectedArray = [1, 2, 3]

      mockFs.readFileSync.mockReturnValue(Buffer.from(mockFileContent))
      mockUtils.safeJsonParse.mockReturnValue(expectedArray)

      const result = readJSON<number[]>('array.json')

      expect(mockFs.readFileSync).toHaveBeenCalledWith('array.json')
      expect(mockUtils.safeJsonParse).toHaveBeenCalledWith(mockFileContent)
      expect(result).toEqual(expectedArray)
    })

    it('should handle complex nested JSON', () => {
      const mockFileContent = '{"nested": {"deep": {"value": true}}}'
      const expectedObject = { nested: { deep: { value: true } } }

      mockFs.readFileSync.mockReturnValue(Buffer.from(mockFileContent))
      mockUtils.safeJsonParse.mockReturnValue(expectedObject)

      const result = readJSON('nested.json')

      expect(result).toEqual(expectedObject)
    })
  })

  describe('readJSONDir', () => {
    it('should read all JSON files in a directory', () => {
      const mockFiles = ['file1.json', 'file2.json', 'config.json']
      const mockFileContents = {
        'file1.json': { data: 'file1' },
        'file2.json': { data: 'file2' },
        'config.json': { setting: true },
      }

      mockFs.readdirSync.mockReturnValue(mockFiles as any)
      mockFs.readFileSync.mockImplementation((filePath) => {
        const fileName = filePath.toString().split('/').pop()
        return Buffer.from(JSON.stringify(mockFileContents[fileName]))
      })
      mockUtils.safeJsonParse.mockImplementation((content) => JSON.parse(content))

      const result = readJSONDir('/test/dir')

      expect(mockFs.readdirSync).toHaveBeenCalledWith('/test/dir')
      expect(result).toEqual({
        file1: { data: 'file1' },
        file2: { data: 'file2' },
        config: { setting: true },
      })
    })

    it('should handle empty directory', () => {
      mockFs.readdirSync.mockReturnValue([] as any)

      const result = readJSONDir('/empty/dir')

      expect(mockFs.readdirSync).toHaveBeenCalledWith('/empty/dir')
      expect(result).toEqual({})
    })

    it('should handle files with multiple dots in name', () => {
      const mockFiles = ['file.test.json', 'another.file.name.json']

      mockFs.readdirSync.mockReturnValue(mockFiles as any)
      mockFs.readFileSync.mockReturnValue(Buffer.from('{}'))
      mockUtils.safeJsonParse.mockReturnValue({})

      const result = readJSONDir('/test/dir')

      expect(result).toEqual({
        file: {},
        another: {},
      })
    })

    it('should call readJSON with correct file paths', () => {
      const mockFiles = ['test.json']

      mockFs.readdirSync.mockReturnValue(mockFiles as any)
      mockFs.readFileSync.mockReturnValue(Buffer.from('{}'))
      mockUtils.safeJsonParse.mockReturnValue({})

      readJSONDir('/base/dir')

      expect(mockFs.readFileSync).toHaveBeenCalledWith(path.join('/base/dir', 'test.json'))
    })

    it('should handle mixed file types (only process .json files implicitly)', () => {
      const mockFiles = ['data.json', 'readme.txt', 'config.json']

      mockFs.readdirSync.mockReturnValue(mockFiles as any)
      mockFs.readFileSync.mockImplementation(() => Buffer.from('{}'))
      mockUtils.safeJsonParse.mockReturnValue({})

      const result = readJSONDir('/mixed/dir')

      expect(Object.keys(result)).toEqual(['data', 'readme', 'config'])
    })
  })
})
