module.exports = {
  upnpNat: jest.fn(() => ({
    map: jest.fn().mockResolvedValue({ 
      internalPort: 9001, 
      externalPort: 9001, 
      protocol: 'TCP' 
    }),
    unmap: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    externalIp: jest.fn().mockResolvedValue('192.168.1.1'),
  })),
  pmpNat: jest.fn(() => ({
    map: jest.fn().mockResolvedValue({ 
      internalPort: 9001, 
      externalPort: 9001, 
      protocol: 'TCP' 
    }),
    unmap: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    externalIp: jest.fn().mockResolvedValue('192.168.1.1'),
  })),
}