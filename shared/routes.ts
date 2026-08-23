import { z } from 'zod';
import { insertWardSchema, wards } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  wards: {
    list: {
      method: 'GET' as const,
      path: '/api/wards',
      responses: {
        200: z.array(z.custom<typeof wards.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/wards/:id',
      responses: {
        200: z.custom<typeof wards.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    history: {
      method: 'GET' as const,
      path: '/api/wards/:id/history',
      responses: {
        200: z.array(z.object({
          timestamp: z.string(),
          aqi: z.number(),
          pm25: z.number(),
          pm10: z.number(),
        })),
        404: errorSchemas.notFound,
      },
    },
    updateControls: {
      method: 'POST' as const,
      path: '/api/wards/:id/controls',
      input: z.object({
        controls: z.array(z.string())
      }),
      responses: {
        200: z.custom<typeof wards.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    toggleEmergency: {
      method: 'POST' as const,
      path: '/api/wards/:id/emergency',
      input: z.object({
        enabled: z.boolean()
      }),
      responses: {
        200: z.custom<typeof wards.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    simulate: {
      method: 'POST' as const,
      path: '/api/wards/:id/simulate',
      input: z.object({
        trafficReduction: z.number().min(0).max(100),
        constructionHalt: z.boolean(),
        dustSuppression: z.number().min(0).max(100),
      }),
      responses: {
        200: z.any(), // Flexible for simulation result
      },
    },
    generatePlan: {
      method: 'POST' as const,
      path: '/api/wards/:id/safe-plan',
      input: z.object({
        ageGroup: z.enum(["child", "adult", "elderly"]),
        condition: z.enum(["healthy", "asthma", "sensitive"]),
        outdoorHours: z.number(),
      }),
      responses: {
        200: z.object({
          safeTimeWindow: z.string(),
          avoidTimeWindow: z.string(),
          maskLevel: z.string(),
          advice: z.string(),
          preventiveMeasures: z.object({
            personal: z.array(z.string()),
            lifestyle: z.array(z.string()),
            community: z.array(z.string()),
          }),
          checklist: z.object({
            do: z.array(z.string()),
            avoid: z.array(z.string()),
          }),
        }),
      },
    },
    addCredit: {
      method: 'POST' as const,
      path: '/api/wards/:id/credits',
      input: z.object({
        action: z.enum(["public_transport", "carpooling", "plantation", "no_waste_burning"])
      }),
      responses: {
        200: z.custom<typeof wards.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    reports: {
      list: {
        method: 'GET' as const,
        path: '/api/wards/:id/reports',
      },
      create: {
        method: 'POST' as const,
        path: '/api/reports',
      },
      verify: {
        method: 'POST' as const,
        path: '/api/reports/:id/verify',
      }
    }
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
