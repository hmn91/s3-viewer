// File sorting logic

export function sortFiles(files, sortBy) {
  const sorted = [...files];
  switch (sortBy) {
    case 'folder':
      sorted.sort((a, b) => a.folder.localeCompare(b.folder) || a.displayName.localeCompare(b.displayName));
      break;
    case 'path':
      sorted.sort((a, b) => a.key.localeCompare(b.key));
      break;
    case 'newest':
      sorted.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
      break;
    case 'oldest':
      sorted.sort((a, b) => (a.lastModified || 0) - (b.lastModified || 0));
      break;
    case 'largest':
      sorted.sort((a, b) => b.size - a.size);
      break;
    case 'smallest':
      sorted.sort((a, b) => a.size - b.size);
      break;
  }
  return sorted;
}
