import { isIPv6, isBogonIP, isInvalidIP } from '../../../../../src/utils/functions/checkIP'

describe('isIPv6', () => {
  test('should return true for valid IPv6 addresses', () => {
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true)
    expect(isIPv6('fe80:0000:0000:0000:0202:b3ff:fe1e:8329')).toBe(true)
    expect(isIPv6('2001:db8:0:0:1:0:0:1')).toBe(true)
    expect(isIPv6('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(true)
    expect(isIPv6('0000:0000:0000:0000:0000:0000:0000:0000')).toBe(true)
  })

  test('should return false for invalid IPv6 addresses with wrong segment count', () => {
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370')).toBe(false) // 7 segments
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334:1234')).toBe(false) // 9 segments
    expect(isIPv6('')).toBe(false)
  })

  test('should return false for IPv6 addresses with invalid hex values', () => {
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:xxxx')).toBe(false) // non-hex characters
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:12345')).toBe(false) // segment too long
    expect(isIPv6('2001:0db8:85g3:0000:0000:8a2e:0370:7334')).toBe(false) // 'g' is not a valid hex character
  })

  test('should validate individual IPv6 segments', () => {
    // Segment with one hex digit should be valid
    expect(isIPv6('2001:db8:85a3:0:0:8a2e:7:1')).toBe(true)
    // Empty segment should be invalid
    expect(isIPv6('2001:db8:85a3:0:0:8a2e:7:')).toBe(false)
    // Segment longer than four characters should be invalid
    expect(isIPv6('2001:db8:85a3:00000:0:8a2e:7:1')).toBe(false)
  })

  test('should return false for IPv4 addresses', () => {
    expect(isIPv6('192.168.1.1')).toBe(false)
    expect(isIPv6('127.0.0.1')).toBe(false)
    expect(isIPv6('8.8.8.8')).toBe(false)
  })
})

describe('isBogonIP', () => {
  test('should return true for private IPv4 addresses', () => {
    expect(isBogonIP('10.0.0.1')).toBe(true) // 10.0.0.0/8
    expect(isBogonIP('10.255.255.255')).toBe(true)
    expect(isBogonIP('172.16.0.1')).toBe(true) // 172.16.0.0/12
    expect(isBogonIP('172.31.255.255')).toBe(true)
    expect(isBogonIP('192.168.0.1')).toBe(true) // 192.168.0.0/16
    expect(isBogonIP('192.168.255.255')).toBe(true)
  })

  test('should return true for special-use IPv4 addresses', () => {
    expect(isBogonIP('127.0.0.1')).toBe(true) // Loopback
    expect(isBogonIP('169.254.1.1')).toBe(true) // Link local
    expect(isBogonIP('100.64.0.1')).toBe(true) // Carrier-grade NAT
    expect(isBogonIP('100.127.255.255')).toBe(true) // Carrier-grade NAT
  })

  test('should return true for reserved IPv4 addresses', () => {
    expect(isBogonIP('0.0.0.1')).toBe(true) // "This" network
    expect(isBogonIP('192.0.0.1')).toBe(true) // IETF protocol assignments
    expect(isBogonIP('192.0.2.1')).toBe(true) // TEST-NET-1
    expect(isBogonIP('198.18.0.1')).toBe(true) // Network interconnect device benchmark testing
    expect(isBogonIP('198.19.255.255')).toBe(true)
    expect(isBogonIP('198.51.100.1')).toBe(true) // TEST-NET-2
    expect(isBogonIP('203.0.113.1')).toBe(true) // TEST-NET-3
    expect(isBogonIP('224.0.0.1')).toBe(true) // Multicast
    expect(isBogonIP('239.255.255.255')).toBe(true)
    expect(isBogonIP('240.0.0.1')).toBe(true) // Reserved for future use
    expect(isBogonIP('255.255.255.255')).toBe(true) // Broadcast
  })

  test('should return false for public IPv4 addresses', () => {
    expect(isBogonIP('8.8.8.8')).toBe(false) // Google DNS
    expect(isBogonIP('1.1.1.1')).toBe(false) // Cloudflare DNS
    expect(isBogonIP('104.16.132.229')).toBe(false) // Public IP
    expect(isBogonIP('216.58.194.174')).toBe(false) // Public IP
  })

  test('should return true for invalid IP formats', () => {
    expect(isBogonIP('256.0.0.1')).toBe(true) // Invalid octet value
    expect(isBogonIP('192.168.1')).toBe(true) // Missing octet
    expect(isBogonIP('192.168.1.1.1')).toBe(true) // Too many octets
    expect(isBogonIP('192.168.01.1')).toBe(true) // Leading zero
    expect(isBogonIP('not-an-ip')).toBe(true) // Not an IP at all
    expect(isBogonIP('')).toBe(true) // Empty string
  })
})

describe('isInvalidIP', () => {
  test('should return true for reserved IPv4 addresses', () => {
    expect(isInvalidIP('0.0.0.1')).toBe(true) // "This" network
    expect(isInvalidIP('192.0.0.1')).toBe(true) // IETF protocol assignments
    expect(isInvalidIP('192.0.2.1')).toBe(true) // TEST-NET-1
    expect(isInvalidIP('198.18.0.1')).toBe(true) // Network interconnect device benchmark testing
    expect(isInvalidIP('198.51.100.1')).toBe(true) // TEST-NET-2
    expect(isInvalidIP('203.0.113.1')).toBe(true) // TEST-NET-3
    expect(isInvalidIP('224.0.0.1')).toBe(true) // Multicast
    expect(isInvalidIP('240.0.0.1')).toBe(true) // Reserved for future use
    expect(isInvalidIP('255.255.255.255')).toBe(true) // Broadcast
  })

  test('should return false for private IPv4 addresses', () => {
    expect(isInvalidIP('10.0.0.1')).toBe(false) // 10.0.0.0/8
    expect(isInvalidIP('172.16.0.1')).toBe(false) // 172.16.0.0/12
    expect(isInvalidIP('192.168.0.1')).toBe(false) // 192.168.0.0/16
    expect(isInvalidIP('127.0.0.1')).toBe(false) // Loopback
    expect(isInvalidIP('169.254.1.1')).toBe(false) // Link local
    expect(isInvalidIP('100.64.0.1')).toBe(false) // Carrier-grade NAT
  })

  test('should return false for public IPv4 addresses', () => {
    expect(isInvalidIP('8.8.8.8')).toBe(false) // Google DNS
    expect(isInvalidIP('1.1.1.1')).toBe(false) // Cloudflare DNS
    expect(isInvalidIP('104.16.132.229')).toBe(false) // Public IP
    expect(isInvalidIP('216.58.194.174')).toBe(false) // Public IP
  })

  test('should return true for invalid IP formats', () => {
    expect(isInvalidIP('256.0.0.1')).toBe(true) // Invalid octet value
    expect(isInvalidIP('192.168.1')).toBe(true) // Missing octet
    expect(isInvalidIP('192.168.1.1.1')).toBe(true) // Too many octets
    expect(isInvalidIP('192.168.01.1')).toBe(true) // Leading zero
    expect(isInvalidIP('not-an-ip')).toBe(true) // Not an IP at all
    expect(isInvalidIP('')).toBe(true) // Empty string
  })
})

// Test edge cases for all functions
describe('Edge cases', () => {
  test('isIPv6 edge cases', () => {
    // Empty segments
    expect(isIPv6('2001:db8::1:0:0:1')).toBe(false) // Contains :: notation which is not handled by current implementation

    // Zero-length segments
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:')).toBe(false)

    // Segments with exactly 4 characters (max allowed)
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7fff')).toBe(true)

    // Mixed case hex
    expect(isIPv6('2001:0dB8:85A3:0000:0000:8a2E:0370:7334')).toBe(true)
  })

  test('isBogonIP and isInvalidIP edge cases', () => {
    // Boundary values for private ranges
    expect(isBogonIP('9.255.255.255')).toBe(false) // Just before 10.0.0.0/8
    expect(isBogonIP('10.0.0.0')).toBe(true) // Start of 10.0.0.0/8
    expect(isBogonIP('11.0.0.0')).toBe(false) // Just after 10.0.0.0/8

    expect(isBogonIP('172.15.255.255')).toBe(false) // Just before 172.16.0.0/12
    expect(isBogonIP('172.16.0.0')).toBe(true) // Start of 172.16.0.0/12
    expect(isBogonIP('172.31.255.255')).toBe(true) // End of 172.16.0.0/12
    expect(isBogonIP('172.32.0.0')).toBe(false) // Just after 172.16.0.0/12

    // Boundary values for reserved ranges
    expect(isBogonIP('223.255.255.255')).toBe(false) // Just before multicast range
    expect(isBogonIP('224.0.0.0')).toBe(true) // Start of multicast range
    expect(isBogonIP('239.255.255.255')).toBe(true) // End of multicast range
    expect(isBogonIP('240.0.0.0')).toBe(true) // Start of reserved range

    // Zero values
    expect(isBogonIP('0.0.0.0')).toBe(true)
  })
})

describe('getIpArr (tested indirectly)', () => {
  test('should handle valid IPv4 addresses through isBogonIP', () => {
    // These calls will use getIpArr internally
    expect(isBogonIP('192.168.1.1')).toBe(true)
    expect(isBogonIP('8.8.8.8')).toBe(false)
  })

  test('should reject invalid IPv4 formats through isBogonIP', () => {
    // These should all return true because getIpArr will throw an error
    expect(isBogonIP('192.168.1')).toBe(true) // Missing octet
    expect(isBogonIP('192.168.1.1.5')).toBe(true) // Too many octets
    expect(isBogonIP('a.b.c.d')).toBe(true) // Non-numeric
    expect(isBogonIP('300.168.1.1')).toBe(true) // Octet > 255
    expect(isBogonIP('-1.168.1.1')).toBe(true) // Negative octet
  })

  test('should reject IPv4 addresses with leading zeros through isBogonIP', () => {
    expect(isBogonIP('192.168.001.1')).toBe(true) // Leading zero
    expect(isBogonIP('192.168.01.1')).toBe(true) // Leading zero
    expect(isBogonIP('192.168.1.01')).toBe(true) // Leading zero
  })
})

describe('isPrivateIP and isReservedIP (tested indirectly)', () => {
  test('isPrivateIP should identify private IPs through isBogonIP', () => {
    // Private IPs should return true from isBogonIP but false from isInvalidIP
    expect(isBogonIP('10.0.0.1')).toBe(true)
    expect(isInvalidIP('10.0.0.1')).toBe(false)

    expect(isBogonIP('172.16.0.1')).toBe(true)
    expect(isInvalidIP('172.16.0.1')).toBe(false)

    expect(isBogonIP('192.168.0.1')).toBe(true)
    expect(isInvalidIP('192.168.0.1')).toBe(false)
  })

  test('isReservedIP should identify reserved IPs through both isBogonIP and isInvalidIP', () => {
    // Reserved IPs should return true from both isBogonIP and isInvalidIP
    expect(isBogonIP('0.0.0.1')).toBe(true)
    expect(isInvalidIP('0.0.0.1')).toBe(true)

    expect(isBogonIP('224.0.0.1')).toBe(true)
    expect(isInvalidIP('224.0.0.1')).toBe(true)

    expect(isBogonIP('240.0.0.1')).toBe(true)
    expect(isInvalidIP('240.0.0.1')).toBe(true)
  })
})

describe('Comprehensive boundary testing', () => {
  // Test all boundary conditions for private IP ranges
  test('10.0.0.0/8 boundaries', () => {
    expect(isBogonIP('9.255.255.255')).toBe(false)
    expect(isBogonIP('10.0.0.0')).toBe(true)
    expect(isBogonIP('10.255.255.255')).toBe(true)
    expect(isBogonIP('11.0.0.0')).toBe(false)
  })

  test('172.16.0.0/12 boundaries', () => {
    expect(isBogonIP('172.15.255.255')).toBe(false)
    expect(isBogonIP('172.16.0.0')).toBe(true)
    expect(isBogonIP('172.31.255.255')).toBe(true)
    expect(isBogonIP('172.32.0.0')).toBe(false)
  })

  test('192.168.0.0/16 boundaries', () => {
    expect(isBogonIP('192.167.255.255')).toBe(false)
    expect(isBogonIP('192.168.0.0')).toBe(true)
    expect(isBogonIP('192.168.255.255')).toBe(true)
    expect(isBogonIP('192.169.0.0')).toBe(false)
  })

  test('100.64.0.0/10 (Carrier-grade NAT) boundaries', () => {
    expect(isBogonIP('100.63.255.255')).toBe(false)
    expect(isBogonIP('100.64.0.0')).toBe(true)
    expect(isBogonIP('100.127.255.255')).toBe(true)
    expect(isBogonIP('100.128.0.0')).toBe(false)
  })

  test('127.0.0.0/8 (Loopback) boundaries', () => {
    expect(isBogonIP('126.255.255.255')).toBe(false)
    expect(isBogonIP('127.0.0.0')).toBe(true)
    expect(isBogonIP('127.255.255.255')).toBe(true)
    expect(isBogonIP('128.0.0.0')).toBe(false)
  })

  test('169.254.0.0/16 (Link local) boundaries', () => {
    expect(isBogonIP('169.253.255.255')).toBe(false)
    expect(isBogonIP('169.254.0.0')).toBe(true)
    expect(isBogonIP('169.254.255.255')).toBe(true)
    expect(isBogonIP('169.255.0.0')).toBe(false)
  })

  // Test all boundary conditions for reserved IP ranges
  test('0.0.0.0/8 ("This" network) boundaries', () => {
    expect(isBogonIP('0.0.0.0')).toBe(true)
    expect(isBogonIP('0.255.255.255')).toBe(true)
    expect(isBogonIP('1.0.0.0')).toBe(false)
  })

  test('224.0.0.0/4 (Multicast) to 240.0.0.0/4 (Reserved) boundaries', () => {
    expect(isBogonIP('223.255.255.255')).toBe(false)
    expect(isBogonIP('224.0.0.0')).toBe(true)
    expect(isBogonIP('239.255.255.255')).toBe(true)
    expect(isBogonIP('240.0.0.0')).toBe(true)
    expect(isBogonIP('255.255.255.254')).toBe(true)
    expect(isBogonIP('255.255.255.255')).toBe(true)
  })
})

describe('Implementation-specific edge cases', () => {
  test('isIPv6 should handle empty string segments correctly', () => {
    // The current implementation doesn't handle IPv6 compression (::)
    // but we should test that it fails gracefully
    expect(isIPv6('2001:db8::1')).toBe(false)
    expect(isIPv6('::1')).toBe(false)
    expect(isIPv6('::')).toBe(false)
  })

  test('isIPv6 should check segment length correctly', () => {
    // Ensure empty segments are rejected
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:')).toBe(false)
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e::7334')).toBe(false)
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:::')).toBe(false)

    // Test with segments that are exactly 4 characters (maximum allowed)
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7fff')).toBe(true)

    // Test with segments that are more than 4 characters
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:12345')).toBe(false)
  })

  test('getIpArr should handle edge cases correctly (tested through isBogonIP)', () => {
    // Test with IP that has exactly 255 in each octet
    expect(isBogonIP('255.255.255.255')).toBe(true)

    // Test with IP that has 0 in each octet
    expect(isBogonIP('0.0.0.0')).toBe(true)

    // Test with IP that has mixed valid octets
    expect(isBogonIP('192.0.2.255')).toBe(true) // TEST-NET-1 with max value in last octet
    expect(isBogonIP('192.0.2.0')).toBe(true) // TEST-NET-1 with min value in last octet
  })

  test('isBogonIP and isInvalidIP should handle whitespace correctly', () => {
    // Test with leading/trailing whitespace
    expect(isBogonIP(' 192.168.1.1')).toBe(true) // Should fail due to whitespace
    expect(isBogonIP('192.168.1.1 ')).toBe(true) // Should fail due to whitespace
    expect(isInvalidIP(' 8.8.8.8')).toBe(true) // Should fail due to whitespace
    expect(isInvalidIP('8.8.8.8 ')).toBe(true) // Should fail due to whitespace
  })

  test('isBogonIP and isInvalidIP should handle undefined and null inputs', () => {
    // @ts-ignore - Testing runtime behavior with invalid inputs
    expect(isBogonIP(undefined)).toBe(true)
    // @ts-ignore - Testing runtime behavior with invalid inputs
    expect(isBogonIP(null)).toBe(true)
    // @ts-ignore - Testing runtime behavior with invalid inputs
    expect(isInvalidIP(undefined)).toBe(true)
    // @ts-ignore - Testing runtime behavior with invalid inputs
    expect(isInvalidIP(null)).toBe(true)
  })
})

describe('Potential implementation bugs', () => {
  test('isIPv6 should correctly handle empty segments', () => {
    // Empty segments should cause validation to fail
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true)
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:')).toBe(false) // Empty segment
    expect(isIPv6('2001:0db8:85a3:0000:0000:8a2e::7334')).toBe(false) // Empty segment
  })

  test('getIpArr should correctly handle the num.toString() !== number check', () => {
    // This test verifies the leading zero detection works correctly
    expect(isBogonIP('192.168.001.1')).toBe(true) // Should fail due to leading zero
    expect(isBogonIP('192.168.1.01')).toBe(true) // Should fail due to leading zero

    // Edge case: single digit numbers
    expect(isBogonIP('1.2.3.4')).toBe(false) // Valid IP, should pass
  })

  test('isPrivateIP should handle all private IP ranges correctly', () => {
    // 10.0.0.0/8
    expect(isBogonIP('10.0.0.0')).toBe(true)
    expect(isBogonIP('10.255.255.255')).toBe(true)

    // 100.64.0.0/10 (Carrier-grade NAT)
    expect(isBogonIP('100.64.0.0')).toBe(true)
    expect(isBogonIP('100.127.255.255')).toBe(true)
    expect(isBogonIP('100.63.255.255')).toBe(false) // Just before CGNAT range
    expect(isBogonIP('100.128.0.0')).toBe(false) // Just after CGNAT range

    // 127.0.0.0/8 (Loopback)
    expect(isBogonIP('127.0.0.0')).toBe(true)
    expect(isBogonIP('127.255.255.255')).toBe(true)

    // 169.254.0.0/16 (Link local)
    expect(isBogonIP('169.254.0.0')).toBe(true)
    expect(isBogonIP('169.254.255.255')).toBe(true)
    expect(isBogonIP('169.253.255.255')).toBe(false) // Just before Link local range
    expect(isBogonIP('169.255.0.0')).toBe(false) // Just after Link local range

    // 172.16.0.0/12
    expect(isBogonIP('172.16.0.0')).toBe(true)
    expect(isBogonIP('172.31.255.255')).toBe(true)
    expect(isBogonIP('172.15.255.255')).toBe(false) // Just before 172.16.0.0/12 range
    expect(isBogonIP('172.32.0.0')).toBe(false) // Just after 172.16.0.0/12 range

    // 192.168.0.0/16
    expect(isBogonIP('192.168.0.0')).toBe(true)
    expect(isBogonIP('192.168.255.255')).toBe(true)
    expect(isBogonIP('192.167.255.255')).toBe(false) // Just before 192.168.0.0/16 range
    expect(isBogonIP('192.169.0.0')).toBe(false) // Just after 192.168.0.0/16 range
  })

  test('isReservedIP should handle all reserved IP ranges correctly', () => {
    // 0.0.0.0/8
    expect(isBogonIP('0.0.0.0')).toBe(true)
    expect(isBogonIP('0.255.255.255')).toBe(true)

    // 192.0.0.0/24
    expect(isBogonIP('192.0.0.0')).toBe(true)
    expect(isBogonIP('192.0.0.255')).toBe(true)
    expect(isBogonIP('192.0.1.0')).toBe(false) // Just after 192.0.0.0/24 range

    // 192.0.2.0/24
    expect(isBogonIP('192.0.2.0')).toBe(true)
    expect(isBogonIP('192.0.2.255')).toBe(true)
    expect(isBogonIP('192.0.1.255')).toBe(false) // Just before 192.0.2.0/24 range
    expect(isBogonIP('192.0.3.0')).toBe(false) // Just after 192.0.2.0/24 range

    // 198.18.0.0/15
    expect(isBogonIP('198.18.0.0')).toBe(true)
    expect(isBogonIP('198.19.255.255')).toBe(true)
    expect(isBogonIP('198.17.255.255')).toBe(false) // Just before 198.18.0.0/15 range
    expect(isBogonIP('198.20.0.0')).toBe(false) // Just after 198.18.0.0/15 range

    // 198.51.100.0/24
    expect(isBogonIP('198.51.100.0')).toBe(true)
    expect(isBogonIP('198.51.100.255')).toBe(true)
    expect(isBogonIP('198.51.99.255')).toBe(false) // Just before 198.51.100.0/24 range
    expect(isBogonIP('198.51.101.0')).toBe(false) // Just after 198.51.100.0/24 range

    // 203.0.113.0/24
    expect(isBogonIP('203.0.113.0')).toBe(true)
    expect(isBogonIP('203.0.113.255')).toBe(true)
    expect(isBogonIP('203.0.112.255')).toBe(false) // Just before 203.0.113.0/24 range
    expect(isBogonIP('203.0.114.0')).toBe(false) // Just after 203.0.113.0/24 range

    // 224.0.0.0/4 to 239.255.255.255/4 (Multicast)
    expect(isBogonIP('224.0.0.0')).toBe(true)
    expect(isBogonIP('239.255.255.255')).toBe(true)
    expect(isBogonIP('223.255.255.255')).toBe(false) // Just before multicast range
    expect(isBogonIP('240.0.0.0')).toBe(true) // Start of reserved range

    // 240.0.0.0/4 to 255.255.255.254 (Reserved for future use)
    expect(isBogonIP('240.0.0.0')).toBe(true)
    expect(isBogonIP('255.255.255.254')).toBe(true)

    // 255.255.255.255/32 (Broadcast)
    expect(isBogonIP('255.255.255.255')).toBe(true)
  })
})
