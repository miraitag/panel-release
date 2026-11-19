import { describe, expect, it } from 'vitest';
import {
  bumpVersion,
  compareVersions,
  highestBump,
  isMajorJump,
  stripRange,
  wrapperRange,
} from './semver';

describe('semver compartido', () => {
  it('incrementa según el tipo de cambio', () => {
    expect(bumpVersion('5.1.3', 'patch')).toBe('5.1.4');
    expect(bumpVersion('5.1.3', 'minor')).toBe('5.2.0');
    expect(bumpVersion('5.1.3', 'major')).toBe('6.0.0');
  });

  it('usa ~ en 0.x y ^ en ≥1', () => {
    expect(wrapperRange('0.12.0')).toBe('~0.12.0');
    expect(wrapperRange('5.2.0')).toBe('^5.2.0');
  });

  it('detecta saltos mayores, incluido el minor de 0.x', () => {
    expect(isMajorJump('3.2.0', '4.0.1')).toBe(true);
    expect(isMajorJump('0.11.4', '0.12.0')).toBe(true);
    expect(isMajorJump('1.7.0', '1.9.2')).toBe(false);
  });

  it('compara y limpia rangos', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(stripRange('^3.6.1')).toBe('3.6.1');
    expect(highestBump(['patch', 'minor'])).toBe('minor');
    expect(highestBump([])).toBeNull();
  });

  it('rechaza versiones inválidas', () => {
    expect(() => bumpVersion('x.y', 'patch')).toThrow();
  });
});
