import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { mapDiscoveredDevice } from '../api/mapping';
import { SmartHomeApi } from '../api/smart-home-api';
import { DiscoveredDevice } from '../models';

/** What a search ended in — the dialog shows a different screen for each. */
export type DiscoveryResult =
  | { readonly status: 'found'; readonly devices: readonly DiscoveredDevice[] }
  | { readonly status: 'none' }
  /** The hub could not be asked at all (offline, or the endpoint is missing). */
  | { readonly status: 'unavailable' };

/**
 * Asks the hub which devices are on the network but not registered yet.
 *
 * `GET /devices/discovered` DOES NOT EXIST IN THE API YET (see
 * docs/API-NOTES.md). Until it does, the call answers 404 and the search ends
 * as `unavailable`, which the dialog explains instead of pretending to search.
 * The mock backend implements the endpoint, so the flow can be run and tested.
 */
@Injectable({ providedIn: 'root' })
export class DeviceDiscoveryService {
  private readonly api = inject(SmartHomeApi);

  async discoverDevices(): Promise<DiscoveryResult> {
    try {
      const dtos = await this.api.getDiscoveredDevices();
      const devices = dtos.map(mapDiscoveredDevice);
      return devices.length > 0 ? { status: 'found', devices } : { status: 'none' };
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        // The endpoint is not there yet: that is a missing feature, not "no devices".
        return { status: 'unavailable' };
      }
      console.error('Asking the hub for discovered devices failed', error);
      return { status: 'unavailable' };
    }
  }
}
