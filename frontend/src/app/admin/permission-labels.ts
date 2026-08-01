import { Permissions } from '../api/models';

export type PermissionKey = keyof Permissions;

export interface PermissionLabel {
  key: PermissionKey;
  /** Für das Formular: ein Satz, der die Berechtigung erklärt. */
  label: string;
  note?: string;
  /** Für die Übersicht: ein Wort, das in eine Tabellenzelle passt. */
  short: string;
}

/**
 * Die Berechtigungen in der Reihenfolge, in der sie aufeinander aufbauen: erst
 * sehen, dann buchen, dann verwalten. Die Reihenfolge ist die der Spec, nicht
 * die des generierten Modells — dort stehen sie alphabetisch.
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
