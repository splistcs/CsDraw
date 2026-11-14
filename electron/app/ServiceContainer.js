import path from 'node:path';
import { DemoLibraryService } from '../core/demo/DemoLibraryService.js';
import { DemoService } from '../core/demo/DemoService.js';
import { VaultTransferService } from '../core/transfer/VaultTransferService.js';
import { BlobStore } from '../core/vault/BlobStore.js';
import { LibraryStore } from '../core/vault/LibraryStore.js';
import { VaultKeyProvider } from '../core/vault/VaultKeyProvider.js';
import { DemoRepository, DrawingRepository, MediaRepository, PlaybookRepository } from '../core/vault/repositories.js';
import { DrawingService, MediaService, PlaybookService } from '../core/vault/services.js';

/** Raiz de composicao: cria e conecta todos os servicos do processo principal. */
export class ServiceContainer {
  static async create({ userDataPath, osCrypto }) {
    const root = path.join(userDataPath, 'vault');
    const keyProvider = new VaultKeyProvider({
      filePath: path.join(root, 'vault.key'),
      protect: osCrypto?.encrypt,
      unprotect: osCrypto?.decrypt
    });
    const blobStore = new BlobStore({ directory: path.join(root, 'blobs'), key: keyProvider.getKey() });
    await blobStore.init();

    const libraryStore = new LibraryStore(blobStore);
    await libraryStore.load();

    const drawingRepository = new DrawingRepository(libraryStore);
    const playbookRepository = new PlaybookRepository(libraryStore);
    const mediaRepository = new MediaRepository(libraryStore);

    const demoRepository = new DemoRepository(libraryStore);
    const demoAnalysis = new DemoService();

    const mediaService = new MediaService({
      blobStore,
      mediaRepository,
      drawingRepository,
      extraKnownBlobIds: () => demoRepository.all().map((demo) => `${DemoLibraryService.BLOB_PREFIX}${demo.id}`)
    });
    await mediaService.collectOrphans();

    return {
      dataPath: root,
      isOsProtected: keyProvider.isOsProtected,
      blobStore,
      mediaRepository,
      drawings: new DrawingService({ drawingRepository, mediaRepository }),
      playbooks: new PlaybookService({ playbookRepository }),
      media: mediaService,
      transfer: new VaultTransferService({ libraryStore, blobStore, mediaService }),
      demoAnalysis,
      demoLibrary: new DemoLibraryService({ demoRepository, blobStore, analysisService: demoAnalysis })
    };
  }
}
