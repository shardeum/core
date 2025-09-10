const mockServer = {
  on: jest.fn(),
  emit: jest.fn(),
  sockets: {
    emit: jest.fn(),
  },
  close: jest.fn(),
}

module.exports = jest.fn(() => mockServer)