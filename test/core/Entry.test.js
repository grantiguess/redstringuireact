import { describe, it, expect } from 'vitest';
import Entry from '../../src/core/Entry'; // Updated path

describe('Entry Class', () => {
  it('should initialize with default values', () => {
    const entry = new Entry();
    expect(entry.getName()).toBe('Untitled');
    expect(entry.getDescription()).toBe('No description.');
    expect(entry.getPicture()).toBe('');
    expect(entry.getColor()).toBe('');
    expect(entry.getId()).toBe(-1);
  });

  it('should initialize with provided values', () => {
    const entry = new Entry('Test Name', 'Test Desc', 'test.jpg', '#ff0000', 123);
    expect(entry.getName()).toBe('Test Name');
    expect(entry.getDescription()).toBe('Test Desc');
    expect(entry.getPicture()).toBe('test.jpg');
    expect(entry.getColor()).toBe('#ff0000');
    expect(entry.getId()).toBe(123);
  });

  it('should allow setting and getting name', () => {
    const entry = new Entry();
    entry.setName('New Name');
    expect(entry.getName()).toBe('New Name');
  });

  it('should allow setting and getting description', () => {
    const entry = new Entry();
    entry.setDescription('New Desc');
    expect(entry.getDescription()).toBe('New Desc');
  });

  it('should allow setting and getting picture', () => {
    const entry = new Entry();
    entry.setPicture('new.png');
    expect(entry.getPicture()).toBe('new.png');
  });

  it('should allow setting and getting color', () => {
    const entry = new Entry();
    entry.setColor('#00ff00');
    expect(entry.getColor()).toBe('#00ff00');
  });

  it('should allow setting and getting id', () => {
    const entry = new Entry();
    entry.setId(456);
    expect(entry.getId()).toBe(456);
  });
}); 