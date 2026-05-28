/**
 * Service configuration — controls mock vs real integrations.
 *
 * Set environment variables to switch to real APIs:
 *   USE_REAL_PRACTICEQ=true
 *   USE_REAL_QUICKBOOKS=true
 *   USE_REAL_LIFEFILE=true
 *   USE_REAL_SPRUCE=true
 *
 * Or set USE_REAL_INTEGRATIONS=true to enable all at once.
 */

const all = process.env.USE_REAL_INTEGRATIONS === "true";

export const serviceConfig = {
  practiceq: {
    useMock: !(all || process.env.USE_REAL_PRACTICEQ === "true"),
    apiKey: process.env.PRACTICEQ_API_KEY ?? "",
    baseUrl: process.env.PRACTICEQ_BASE_URL ?? "https://intakeq.com/api/v1",
    intakeEndpoint: process.env.PRACTICEQ_INTAKE_ENDPOINT ?? "",
    questionnaireId: process.env.PRACTICEQ_QUESTIONNAIRE_ID ?? "",
  },
  quickbooks: {
    useMock: !(all || process.env.USE_REAL_QUICKBOOKS === "true"),
    clientId: process.env.QB_CLIENT_ID ?? "",
    clientSecret: process.env.QB_CLIENT_SECRET ?? "",
    realmId: process.env.QB_REALM_ID ?? "",
    refreshToken: process.env.QB_REFRESH_TOKEN ?? "",
  },
  lifefile: {
    useMock: !(all || process.env.USE_REAL_LIFEFILE === "true"),
    vendorId: process.env.LIFEFILE_VENDOR_ID ?? process.env.LF_X_VENDOR_ID ?? "",
    locationId: process.env.LIFEFILE_LOCATION_ID ?? process.env.LF_X_LOCATION_ID ?? "",
    apiNetworkId: process.env.LIFEFILE_API_NETWORK_ID ?? process.env.LF_X_API_NETWORK_ID ?? "",
    username: process.env.LIFEFILE_API_USERNAME ?? process.env.LF_API_USERNAME ?? "",
    password: process.env.LIFEFILE_API_PASSWORD ?? process.env.LF_API_PASSWORD ?? "",
    practiceId: process.env.LIFEFILE_PRACTICE_ID ?? "1018988",
    baseUrl: process.env.LIFEFILE_BASE_URL ?? "https://host100-7.lifefile.net/lfapi/v1",
    orderEndpoint: process.env.LIFEFILE_ORDER_ENDPOINT ?? process.env.LF_ENDPOINT_ORDER_API ?? "",
    prescriberNpi: process.env.LIFEFILE_PRESCRIBER_NPI ?? "",
    prescriberLicenseState: process.env.LIFEFILE_PRESCRIBER_LICENSE_STATE ?? "",
    prescriberLicenseNumber: process.env.LIFEFILE_PRESCRIBER_LICENSE_NUMBER ?? "",
    prescriberLastName: process.env.LIFEFILE_PRESCRIBER_LAST_NAME ?? "",
    prescriberFirstName: process.env.LIFEFILE_PRESCRIBER_FIRST_NAME ?? "",
    prescriberPhone: process.env.LIFEFILE_PRESCRIBER_PHONE ?? "",
    prescriberEmail: process.env.LIFEFILE_PRESCRIBER_EMAIL ?? "",
    shippingServiceId: parseInt(process.env.LIFEFILE_SHIPPING_SERVICE_ID ?? "6230", 10),
  },
  spruce: {
    useMock: !(all || process.env.USE_REAL_SPRUCE === "true"),
    apiKey: process.env.SPRUCE_API_KEY ?? "",
    fromNumber: process.env.SPRUCE_FROM_NUMBER ?? "",
    baseUrl: process.env.SPRUCE_BASE_URL ?? "https://api.sprucehealth.com/v1",
  },
};

export type ServiceConfig = typeof serviceConfig;
