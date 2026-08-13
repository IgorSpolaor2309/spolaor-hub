import { trackLeadJourney } from "./leads.functions";

export const safeTrackLead = async (params: { data: any }) => {
  try {
    return await trackLeadJourney(params);
  } catch (error) {
    console.warn("Lead tracking failed but continuing flow:", error);
    return { success: false, prospectId: "" };
  }
};
