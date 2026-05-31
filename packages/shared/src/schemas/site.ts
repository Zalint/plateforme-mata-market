import { z } from 'zod';
import { SITE_STATUSES, SITE_TYPES } from '../constants/enums.js';
import {
  IsoDateTimeSchema,
  LatitudeSchema,
  LongitudeSchema,
  PhoneSnSchema,
  UuidSchema,
} from './common.js';

/**
 * Schemas Site · sites de production / retrait.
 *
 * Géoloc lat/lng optionnelle au MVP (saisie manuelle ou auto via WhatsApp
 * location share). Une zone est obligatoire (FK contrainte DB).
 */

export const SiteTypeSchema = z.enum(SITE_TYPES);
export const SiteStatusSchema = z.enum(SITE_STATUSES);

// ─────────────────────────────────────────────────────────────────
// Helpers

const NameSchema = z.string().min(2).max(120);
const AddressSchema = z.string().min(2).max(200).optional();

// vehicleAccess est libre côté DB (cf. schema.prisma) mais on guide les
// saisies. Au backend on accepte les valeurs guidées OU une chaîne libre
// courte pour ne pas bloquer un cas non prévu.
const VehicleAccessSchema = z.string().min(2).max(40).optional();

// pickupHours est libre au MVP (« Matin · 6h-10h », « Aube · 5h-8h »).
// Au Lot 7 (tournées) on pourra structurer en { from, to, days }.
const PickupHoursSchema = z.string().min(2).max(60).optional();

// ─────────────────────────────────────────────────────────────────
// CRUD

export const SiteCreateSchema = z.object({
  name: NameSchema,
  type: SiteTypeSchema,
  zoneId: UuidSchema,
  addressLine: AddressSchema,
  geoLat: LatitudeSchema.optional(),
  geoLng: LongitudeSchema.optional(),
  vehicleAccess: VehicleAccessSchema,
  contactName: z.string().min(2).max(80).optional(),
  contactPhone: PhoneSnSchema.optional(),
  pickupHours: PickupHoursSchema,
});

export type SiteCreate = z.infer<typeof SiteCreateSchema>;

export const SiteUpdateSchema = SiteCreateSchema.partial();
export type SiteUpdate = z.infer<typeof SiteUpdateSchema>;

export const SiteOutputSchema = z.object({
  id: UuidSchema,
  producerUserId: UuidSchema,
  name: z.string(),
  type: SiteTypeSchema,
  status: SiteStatusSchema,
  zoneId: UuidSchema,
  addressLine: z.string().nullable(),
  geoLat: LatitudeSchema.nullable(),
  geoLng: LongitudeSchema.nullable(),
  vehicleAccess: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: PhoneSnSchema.nullable(),
  pickupHours: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type SiteOutput = z.infer<typeof SiteOutputSchema>;

export const SiteListResponseSchema = z.object({
  sites: z.array(SiteOutputSchema),
});

export type SiteListResponse = z.infer<typeof SiteListResponseSchema>;
