import { CountedEvent, CountedEventMap } from '../../../src/statistics/countedEvents'

describe('countedEvents types', () => {
  describe('CountedEvent type', () => {
    it('should allow creating a valid CountedEvent object', () => {
      const event: CountedEvent = {
        eventCategory: 'network',
        eventName: 'connectionEstablished',
        eventCount: 5,
        eventTimestamps: [1234567890, 1234567891, 1234567892],
        eventMessages: ['Connection from peer1', 'Connection from peer2'],
      }

      expect(event.eventCategory).toBe('network')
      expect(event.eventName).toBe('connectionEstablished')
      expect(event.eventCount).toBe(5)
      expect(event.eventTimestamps).toHaveLength(3)
      expect(event.eventMessages).toHaveLength(2)
    })

    it('should allow empty arrays for timestamps and messages', () => {
      const event: CountedEvent = {
        eventCategory: 'system',
        eventName: 'startup',
        eventCount: 0,
        eventTimestamps: [],
        eventMessages: [],
      }

      expect(event.eventTimestamps).toEqual([])
      expect(event.eventMessages).toEqual([])
    })

    it('should accept different string types for category and name', () => {
      const events: CountedEvent[] = [
        {
          eventCategory: 'NETWORK_EVENTS',
          eventName: 'PEER_CONNECTED',
          eventCount: 1,
          eventTimestamps: [Date.now()],
          eventMessages: ['Peer connected'],
        },
        {
          eventCategory: 'system.monitor',
          eventName: 'memory.usage.high',
          eventCount: 3,
          eventTimestamps: [Date.now()],
          eventMessages: ['High memory usage detected'],
        },
        {
          eventCategory: '123',
          eventName: '456',
          eventCount: 0,
          eventTimestamps: [],
          eventMessages: [],
        },
      ]

      events.forEach((event) => {
        expect(typeof event.eventCategory).toBe('string')
        expect(typeof event.eventName).toBe('string')
      })
    })
  })

  describe('CountedEventMap type', () => {
    it('should allow creating a valid CountedEventMap', () => {
      const eventMap: CountedEventMap = new Map()

      expect(eventMap).toBeInstanceOf(Map)
      expect(eventMap.size).toBe(0)
    })

    it('should allow nested map structure', () => {
      const eventMap: CountedEventMap = new Map()
      const networkEvents = new Map<string, CountedEvent>()

      const connectionEvent: CountedEvent = {
        eventCategory: 'network',
        eventName: 'connection',
        eventCount: 1,
        eventTimestamps: [Date.now()],
        eventMessages: ['Connected'],
      }

      networkEvents.set('connection', connectionEvent)
      eventMap.set('network', networkEvents)

      expect(eventMap.has('network')).toBe(true)
      expect(eventMap.get('network')).toBe(networkEvents)
      expect(eventMap.get('network')?.get('connection')).toBe(connectionEvent)
    })

    it('should handle multiple categories and events', () => {
      const eventMap: CountedEventMap = new Map()

      // Add network category
      const networkEvents = new Map<string, CountedEvent>()
      networkEvents.set('connect', {
        eventCategory: 'network',
        eventName: 'connect',
        eventCount: 10,
        eventTimestamps: [],
        eventMessages: [],
      })
      networkEvents.set('disconnect', {
        eventCategory: 'network',
        eventName: 'disconnect',
        eventCount: 5,
        eventTimestamps: [],
        eventMessages: [],
      })

      // Add system category
      const systemEvents = new Map<string, CountedEvent>()
      systemEvents.set('startup', {
        eventCategory: 'system',
        eventName: 'startup',
        eventCount: 1,
        eventTimestamps: [Date.now()],
        eventMessages: ['System started'],
      })

      eventMap.set('network', networkEvents)
      eventMap.set('system', systemEvents)

      expect(eventMap.size).toBe(2)
      expect(eventMap.get('network')?.size).toBe(2)
      expect(eventMap.get('system')?.size).toBe(1)
    })

    it('should allow iteration over the map', () => {
      const eventMap: CountedEventMap = new Map()
      const categories = ['network', 'system', 'database']

      categories.forEach((category) => {
        const events = new Map<string, CountedEvent>()
        events.set('test', {
          eventCategory: category,
          eventName: 'test',
          eventCount: 1,
          eventTimestamps: [],
          eventMessages: [],
        })
        eventMap.set(category, events)
      })

      const collectedCategories: string[] = []
      for (const [category] of eventMap) {
        collectedCategories.push(category)
      }

      expect(collectedCategories).toEqual(categories)
    })
  })

  describe('Type usage scenarios', () => {
    it('should work with utility functions', () => {
      function createEvent(category: string, name: string): CountedEvent {
        return {
          eventCategory: category,
          eventName: name,
          eventCount: 0,
          eventTimestamps: [],
          eventMessages: [],
        }
      }

      function incrementEvent(event: CountedEvent, message?: string): CountedEvent {
        return {
          ...event,
          eventCount: event.eventCount + 1,
          eventTimestamps: [...event.eventTimestamps, Date.now()],
          eventMessages: message ? [...event.eventMessages, message] : event.eventMessages,
        }
      }

      const event = createEvent('test', 'increment')
      const updatedEvent = incrementEvent(event, 'First increment')

      expect(updatedEvent.eventCount).toBe(1)
      expect(updatedEvent.eventTimestamps).toHaveLength(1)
      expect(updatedEvent.eventMessages).toContain('First increment')
    })

    it('should work with map operations', () => {
      function getOrCreateEvent(map: CountedEventMap, category: string, name: string): CountedEvent {
        if (!map.has(category)) {
          map.set(category, new Map())
        }

        const categoryMap = map.get(category)!
        if (!categoryMap.has(name)) {
          categoryMap.set(name, {
            eventCategory: category,
            eventName: name,
            eventCount: 0,
            eventTimestamps: [],
            eventMessages: [],
          })
        }

        return categoryMap.get(name)!
      }

      const eventMap: CountedEventMap = new Map()
      const event1 = getOrCreateEvent(eventMap, 'network', 'ping')
      const event2 = getOrCreateEvent(eventMap, 'network', 'ping')

      expect(event1).toBe(event2) // Should return same reference
      expect(eventMap.get('network')?.size).toBe(1)
    })
  })
})
