const { contextBridge, ipcRenderer, webUtils } = require('electron');

async function call(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response?.ok) throw new Error(`[[${response?.code ?? 'UNEXPECTED'}]] ${response?.message ?? 'Unknown error.'}`);
  return response.data;
}

contextBridge.exposeInMainWorld('csdraw', {
  drawings: {
    list: () => call('drawings:list'),
    get: (id) => call('drawings:get', id),
    save: (payload) => call('drawings:save', payload),
    remove: (id) => call('drawings:remove', id)
  },
  playbooks: {
    list: () => call('playbooks:list'),
    get: (id) => call('playbooks:get', id),
    save: (payload) => call('playbooks:save', payload),
    remove: (id) => call('playbooks:remove', id)
  },
  media: {
    tree: () => call('media:tree'),
    createFolder: (payload) => call('media:createFolder', payload),
    renameFolder: (payload) => call('media:renameFolder', payload),
    removeFolder: (id) => call('media:removeFolder', id),
    pickAndImport: (folderId, title) => call('media:pickAndImport', folderId, title),
    importPaths: (paths, folderId) => call('media:importPaths', paths, folderId),
    addBuffer: (payload) => call('media:addBuffer', payload),
    rename: (payload) => call('media:rename', payload),
    move: (payload) => call('media:move', payload),
    remove: (id) => call('media:remove', id)
  },
  vault: {
    status: () => call('vault:status'),
    exportVault: (passphrase, title) => call('vault:export', passphrase, title),
    importVault: (passphrase, mode, title) => call('vault:import', passphrase, mode, title)
  },
  demos: {
    list: () => call('demos:list'),
    pick: (title) => call('demos:pick', title),
    import: (filePath) => call('demos:import', filePath),
    open: (id) => call('demos:open', id),
    rename: (payload) => call('demos:rename', payload),
    setTags: (payload) => call('demos:setTags', payload),
    remove: (id) => call('demos:remove', id),
    cancel: () => call('demos:cancel'),
    onProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('demo:progress', listener);
      return () => ipcRenderer.removeListener('demo:progress', listener);
    }
  },
  updates: {
    state: () => call('update:state'),
    check: () => call('update:check'),
    install: () => call('update:install'),
    openReleases: () => call('update:openReleases'),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('update:state', listener);
      return () => ipcRenderer.removeListener('update:state', listener);
    }
  },
  files: {
    pathFor: (file) => webUtils.getPathForFile(file)
  }
});
