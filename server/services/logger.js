const PREFIX = '[RetroBoard]';

export function info(...args) {
  console.info(PREFIX, new Date().toISOString(), ...args);
}

export function error(...args) {
  console.error(PREFIX, 'ERROR', new Date().toISOString(), ...args);
}

export function warn(...args) {
  console.warn(PREFIX, 'WARN', new Date().toISOString(), ...args);
}
