import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { COMMAND_EVENT_TYPE, parseCommand } from './mapping';
import { MockApiState, mockApiInterceptor } from './mock-api';
import { SmartHomeApi } from './smart-home-api';

/**
 * Contract tests: the typed client against the mock backend through HttpClient —
 * the same wiring the app uses. The shapes here are verified against the real
 * API (SmartHomeIoT.Api), so a deviation in the mock is caught here.
 */
describe('SmartHomeApi against the mock backend', () => {
  let apiClient: SmartHomeApi;
  let state: MockApiState;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor]))],
    });
    state = TestBed.inject(MockApiState);
    state.minLatencyMs = 0;
    state.maxLatencyMs = 0;
    state.commandFailureRate = 0;
    state.offlineRecoveryRate = 0;
    apiClient = TestBed.inject(SmartHomeApi);
  });

  it('lists rooms with device counts', async () => {
    const rooms = await apiClient.getRooms();
    expect(rooms.length).toBe(5);
    expect(rooms.find((room) => room.roomId === 1)?.deviceCount).toBe(4);
  });

  it('serves devices seen on the network but not registered', async () => {
    const discovered = await apiClient.getDiscoveredDevices();
    expect(discovered.length).toBe(2);
    // The MAC is the identity; the type is a hint the hub may not have.
    expect(
      discovered.every((device) => /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(device.macAddress)),
    ).toBe(true);
    expect(discovered.some((device) => device.type === null)).toBe(true);

    // Registering one takes it off the list: it is no longer waiting.
    const target = discovered[0];
    await apiClient.registerDevice({
      name: 'Nyt termometer',
      type: 'thermometer',
      roomId: 1,
      macAddress: target.macAddress,
    });
    const left = await apiClient.getDiscoveredDevices();
    expect(left.map((device) => device.macAddress)).not.toContain(target.macAddress);
  });

  it('leaves MAC, IP and registration date out of the device list', async () => {
    const devices = await apiClient.getDevices();
    expect(devices.length).toBe(10);
    expect(devices[0]).not.toHaveProperty('macAddress');
    expect(devices[0]).not.toHaveProperty('registrationDate');

    const detail = await apiClient.getDevice('1');
    expect(detail.macAddress).toMatch(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/);
    expect(detail.iPv4Address).toBe('192.168.1.51');
  });

  it('sends timestamps without a timezone, like the API reading them from MySQL', async () => {
    const samples = await apiClient.querySensorData({ deviceId: '3', take: 1 });
    expect(samples[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('rejects deleting a room that still has devices with 409', async () => {
    await expect(apiClient.deleteRoom('5')).rejects.toMatchObject({ status: 409 });
  });

  it('deletes a room once its devices are moved elsewhere', async () => {
    await apiClient.updateDevice('10', {
      name: 'Bevægelsessensor',
      type: 'motion',
      roomId: 1,
    });
    await apiClient.deleteRoom('5');
    const rooms = await apiClient.getRooms();
    expect(rooms.some((room) => room.roomId === 5)).toBe(false);
  });

  it('refuses a device whose MAC address is already registered', async () => {
    const existing = await apiClient.getDevice('1');
    await expect(
      apiClient.registerDevice({
        name: 'Dublet',
        type: 'lamp',
        roomId: 1,
        macAddress: existing.macAddress,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects out-of-range sensor data with 422 and writes an event-log entry', async () => {
    await expect(
      apiClient.ingestSensorData({
        deviceId: 3,
        sensorType: 'temperature',
        value: 999,
        unit: '°C',
      }),
    ).rejects.toSatisfy((error: unknown) => (error as HttpErrorResponse).status === 422);
    const events = await apiClient.queryEventLog({ eventType: 'SensorOutOfRange' });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].deviceId).toBe(3);
  });

  it('rejects a measurement whose unit does not match the sensor type', async () => {
    await expect(
      apiClient.ingestSensorData({ deviceId: 3, sensorType: 'temperature', value: 21, unit: '%' }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('serves 24h history as a flat list, oldest first, filtered by sensor type', async () => {
    const samples = await apiClient.getDeviceHistory('3', {
      range: '24h',
      sensorType: 'temperature',
    });
    expect(samples.length).toBeGreaterThan(10);
    expect(samples.every((sample) => sample.sensorType === 'temperature')).toBe(true);
    const timestamps = samples.map((sample) => sample.timestamp);
    expect([...timestamps].sort()).toEqual(timestamps);
  });

  it('refuses commands to an offline device with 503', async () => {
    await expect(apiClient.sendDeviceCommand('10', { command: 'ON' })).rejects.toMatchObject({
      status: 503,
    });
  });

  it('records an accepted command in the event log', async () => {
    await apiClient.sendDeviceCommand('2', { command: 'ON' });
    const events = await apiClient.getDeviceEvents('2');
    expect(events[0].event).toBe(COMMAND_EVENT_TYPE);
    expect(parseCommand(events[0].description)).toBe('ON');
  });

  it('keeps events with deviceId = null after a device is deleted', async () => {
    await apiClient.sendDeviceCommand('2', { command: 'ON' });
    await apiClient.deleteDevice('2');
    const commands = await apiClient.queryEventLog({ eventType: COMMAND_EVENT_TYPE });
    expect(commands.some((event) => event.deviceId === null)).toBe(true);
  });

  it('cascades sensor history when a device is deleted', async () => {
    expect((await apiClient.querySensorData({ deviceId: '3' })).length).toBeGreaterThan(0);
    await apiClient.deleteDevice('3');
    expect(await apiClient.querySensorData({ deviceId: '3' })).toEqual([]);
  });

  it('caps a query at the requested take, newest first', async () => {
    const samples = await apiClient.querySensorData({ deviceId: '3', take: 5 });
    expect(samples.length).toBe(5);
    const timestamps = samples.map((sample) => sample.timestamp);
    expect([...timestamps].sort().reverse()).toEqual(timestamps);
  });

  it('summarizes the home for the dashboard', async () => {
    const summary = await apiClient.getDashboardSummary();
    expect(summary.totalRooms).toBe(5);
    expect(summary.totalDevices).toBe(10);
    expect(summary.offlineDevices).toBe(1);
    expect(summary.onlineDevices).toBe(9);
    expect(summary.measurementsLast24Hours).toBeGreaterThan(0);
  });
});
