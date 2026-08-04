/**
 * The booker's name and contact are stored as a cookie so that they do not have
 * to be typed again for every booking.
 */
const NAME_KEY = 'qwv_booker_name';
const CONTACT_KEY = 'qwv_booker_contact';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export interface Booker {
  name: string;
  contact: string;
}

export function readBooker(): Booker {
  return {
    name: readCookie(NAME_KEY),
    contact: readCookie(CONTACT_KEY),
  };
}

export function writeBooker(booker: Booker): void {
  writeCookie(NAME_KEY, booker.name);
  writeCookie(CONTACT_KEY, booker.contact);
}

function readCookie(key: string): string {
  const match = document.cookie.split('; ').find((entry) => entry.startsWith(`${key}=`));

  return match ? decodeURIComponent(match.slice(key.length + 1)) : '';
}

function writeCookie(key: string, value: string): void {
  // HttpOnly is not possible (the client writes it itself), but SameSite=Lax and
  // a year of shelf life. It is data the user enters themselves anyway.
  document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
