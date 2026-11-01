import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { FILE_NAME_MAX, RESOURCE_TITLE_MAX, RESOURCE_TYPES, RESOURCE_URL_MAX } from '@studibrowse/shared';

const resourceSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: RESOURCE_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: RESOURCE_TITLE_MAX },
    url: { type: String, required: true, maxlength: RESOURCE_URL_MAX },
    /** Bytes, for files. Null for links. */
    size: { type: Number, default: null },
    // Files only. The derived urls are built once, when the file is shared, so serializing stays simple.
    fileName: { type: String, default: null, maxlength: FILE_NAME_MAX },
    downloadUrl: { type: String, default: null },
    /** Images only. */
    thumbnailUrl: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

resourceSchema.index({ roomId: 1, createdAt: 1 });

export type ResourceDocument = HydratedDocument<InferSchemaType<typeof resourceSchema>>;

export const Resource = model('Resource', resourceSchema);
