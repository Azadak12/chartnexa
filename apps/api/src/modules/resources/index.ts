// Public surface of the resources module.
export { ResourcesModule } from "./resources.module.js";
export { ResourcesService } from "./resources.service.js";
export { VideoService } from "./video.service.js";
export { OBJECT_STORAGE, type ObjectStorage } from "./storage.js";
export { signFileGrant, verifyFileGrant } from "./file-token.js";
export { ALLOWED_TYPES, safeFileName, sniffType, type AllowedType } from "./file-types.js";
