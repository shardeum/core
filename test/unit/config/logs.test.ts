import LOGS_CONFIG from '../../../src/config/logs'

describe('logs config', () => {
  describe('LOGS_CONFIG structure', () => {
    it('should have the correct top-level configuration', () => {
      expect(LOGS_CONFIG).toHaveProperty('saveConsoleOutput', true)
      expect(LOGS_CONFIG).toHaveProperty('dir', 'logs')
      expect(LOGS_CONFIG).toHaveProperty('files')
      expect(LOGS_CONFIG).toHaveProperty('options')
    })

    it('should have correct file configurations', () => {
      expect(LOGS_CONFIG.files).toEqual({
        main: '',
        fatal: '',
        net: '',
        app: '',
        seq: '',
      })
    })

    it('should have all required appenders', () => {
      const appenders = LOGS_CONFIG.options.appenders
      const expectedAppenders = [
        'out',
        'seq',
        'main',
        'app',
        'p2p',
        'snapshot',
        'cycle',
        'fatal',
        'exit',
        'errorFile',
        'errors',
        'net',
        'playback',
        'shardDump',
        'statsDump',
      ]

      expectedAppenders.forEach((appender) => {
        expect(appenders).toHaveProperty(appender)
      })
    })

    it('should have correct file appender configurations', () => {
      const fileAppenders = [
        'snapshot',
        'cycle',
        'fatal',
        'exit',
        'errorFile',
        'net',
        'playback',
        'shardDump',
        'statsDump',
      ]

      fileAppenders.forEach((appender) => {
        expect(LOGS_CONFIG.options.appenders[appender]).toHaveProperty('type', 'dateFileWithSize')
        expect(LOGS_CONFIG.options.appenders[appender]).toHaveProperty('maxLogSize', 10485760)
        expect(LOGS_CONFIG.options.appenders[appender]).toHaveProperty('backups', 10)
      })

      // seq uses the same appender and limits
      expect(LOGS_CONFIG.options.appenders.seq).toHaveProperty('type', 'dateFileWithSize')
      expect(LOGS_CONFIG.options.appenders.seq).toHaveProperty('backups', 10)
    })

    it('should have correct dateFile appender configurations', () => {
      const dateFileAppenders = ['main', 'app', 'p2p']

      dateFileAppenders.forEach((appender) => {
        expect(LOGS_CONFIG.options.appenders[appender]).toHaveProperty('type', 'dateFileWithSize')
        expect(LOGS_CONFIG.options.appenders[appender]).toHaveProperty('pattern')
        expect(LOGS_CONFIG.options.appenders[appender]).toHaveProperty('keepFileExt', true)
        expect(LOGS_CONFIG.options.appenders[appender]).toHaveProperty('maxLogSize', 10485760)
        expect(LOGS_CONFIG.options.appenders[appender]).toHaveProperty('backups', 10)
        expect(LOGS_CONFIG.options.appenders[appender]).toHaveProperty('numBackups')
        expect(LOGS_CONFIG.options.appenders[appender]).toHaveProperty('compress', false)
        expect(LOGS_CONFIG.options.appenders[appender]).toHaveProperty('alwaysIncludePattern', false)
      })
    })

    it('should have correct console appender configuration', () => {
      expect(LOGS_CONFIG.options.appenders.out).toEqual({
        type: 'console',
        maxLogSize: 10000000,
        backups: 10,
      })
    })

    it('should have correct errors filter appender configuration', () => {
      expect(LOGS_CONFIG.options.appenders.errors).toEqual({
        type: 'logLevelFilter',
        level: 'ERROR',
        appender: 'errorFile',
      })
    })

    it('should have larger maxLogSize for seq appender', () => {
      expect(LOGS_CONFIG.options.appenders.seq.maxLogSize).toBe(10485760)
    })

    it('should have all required categories', () => {
      const categories = LOGS_CONFIG.options.categories
      const expectedCategories = [
        'default',
        'app',
        'main',
        'seq',
        'p2p',
        'snapshot',
        'cycle',
        'fatal',
        'exit',
        'net',
        'playback',
        'shardDump',
        'statsDump',
      ]

      expectedCategories.forEach((category) => {
        expect(categories).toHaveProperty(category)
      })
    })

    it('should have correct category configurations', () => {
      const categories = LOGS_CONFIG.options.categories

      // Default category
      expect(categories.default).toEqual({
        appenders: ['out'],
        level: 'trace',
      })

      // Categories with error appender
      expect(categories.app).toEqual({
        appenders: ['app', 'errors'],
        level: 'trace',
      })
      expect(categories.main).toEqual({
        appenders: ['main', 'errors'],
        level: 'trace',
      })

      // Categories with single appender
      const singleAppenderCategories = ['seq', 'p2p', 'snapshot', 'cycle', 'net', 'playback', 'shardDump', 'statsDump']
      singleAppenderCategories.forEach((category) => {
        expect(categories[category]).toEqual({
          appenders: [category],
          level: 'trace',
        })
      })

      // Fatal level categories
      expect(categories.fatal).toEqual({
        appenders: ['fatal'],
        level: 'fatal',
      })
      expect(categories.exit).toEqual({
        appenders: ['exit'],
        level: 'fatal',
      })
    })

    it('should export default configuration', () => {
      expect(LOGS_CONFIG).toBeDefined()
      expect(typeof LOGS_CONFIG).toBe('object')
    })

    it('should have consistent appender names between appenders and categories', () => {
      const appenderNames = Object.keys(LOGS_CONFIG.options.appenders)
      const categoryNames = Object.keys(LOGS_CONFIG.options.categories)

      categoryNames.forEach((categoryName) => {
        if (categoryName !== 'default') {
          const category = LOGS_CONFIG.options.categories[categoryName]
          category.appenders.forEach((appenderName: string) => {
            expect(appenderNames).toContain(appenderName)
          })
        }
      })
    })
  })
})
