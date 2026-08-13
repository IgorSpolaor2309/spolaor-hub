import { trackLeadJourney } from "./leads.functions";

export const safeTrackLead = async (params: { data: any }) => {
  try {
    if (typeof window === 'undefined') return { success: false, prospectId: "" };
    
    // Ensure data object exists
    if (!params.data) params.data = {};
    
    const result = await trackLeadJourney(params);
    
    if (result?.prospectId) {
      window.sessionStorage.setItem('digital_sc_prospect_id', result.prospectId);
    }
    
    return result;
  } catch (error) {
    console.warn("Lead tracking failed but continuing flow:", error);
    const storedId = typeof window !== 'undefined' ? window.sessionStorage.getItem('digital_sc_prospect_id') : null;
    return { success: false, prospectId: storedId || "" };
  }
};

export const getStoredProspectId = () => {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem('digital_sc_prospect_id');
};
