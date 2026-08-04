import { Permissions } from '../api/models';

export type PermissionKey = keyof Permissions;

export interface PermissionLabel {
  key: PermissionKey;
  /** For the form: a sentence explaining the permission. */
  label: string;
  note?: string;
  /** For the overview: a single word that fits into a table cell. */
  short: string;
}

/**
 * The permissions in the order in which they build on one another: first seeing,
 * then booking, then managing. The order is the spec's, not the generated model's
 * — there they are alphabetical.
 */
export const PERMISSION_LABELS: readonly PermissionLabel[] = [
  {
    key: 'viewBookings',
    label: 'Buchungen sehen, mit Namen der Buchenden',
    note: 'Ohne diese Berechtigung sieht die Rolle nur, dass belegt ist, nicht von wem.',
    short: 'sehen',
  },
  {
    key: 'viewBookingsDetails',
    label: 'Zusätzlich die Kontaktangaben sehen',
    short: 'Kontakte',
  },
  {
    key: 'manageBookings',
    label: 'Buchungen erstellen, ändern und löschen',
    note: 'Jede Buchung, auch die von anderen — es gibt Rollen, keine Benutzer.',
    short: 'buchen',
  },
  {
    key: 'noTimeRestrictions',
    label: 'Ohne Beschränkung von Buchungsdauer und Vorlauf',
    note: 'Die Öffnungszeiten gelten weiterhin.',
    short: 'ohne Limiten',
  },
  {
    key: 'manageBookingSeries',
    label: 'Buchungsserien verwalten',
    short: 'Serien',
  },
  {
    key: 'manageWorkplaces',
    label: 'Arbeitsplätze ändern',
    short: 'Arbeitsplätze',
  },
  {
    key: 'manageAreas',
    label: 'Bereiche ändern',
    short: 'Bereiche',
  },
  {
    key: 'manageRoles',
    label: 'Rollen und globale Konfiguration ändern',
    note: 'Schliesst die Kennwörter aller Rollen ein.',
    short: 'Rollen',
  },
];
