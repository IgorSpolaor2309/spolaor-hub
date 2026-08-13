import { trackLeadJourney } from "./leads.functions";

export const safeTrackLead = async (data: any) => {
  try {
    return await trackLeadJourney({ data });
  } catch (error) {
    console.warn("Lead tracking failed but continuing flow:", error);
    return null;
  }
};
