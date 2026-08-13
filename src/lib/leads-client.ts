import { trackLeadJourney } from "./leads.functions";

export const safeTrackLead = async (params: { data: any }) => {
  try {
    // Check if we are on client side before tracking
    if (typeof window === 'undefined') return { success: false, prospectId: "" };
    
    const result = await trackLeadJourney(params);
    
    // Persist prospectId in session storage to maintain journey state
    if (result?.prospectId) {
      window.sessionStorage.setItem('digital_sc_prospect_id', result.prospectId);
    }
    
    return result;
  } catch (error) {
    console.warn("Lead tracking failed but continuing flow:", error);
    // Try to recover prospectId from session storage if tracking fails
    const storedId = typeof window !== 'undefined' ? window.sessionStorage.getItem('digital_sc_prospect_id') : null;
    return { success: false, prospectId: storedId || "" };
  }
};

export const getStoredProspectId = () => {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem('digital_sc_prospect_id');
};
