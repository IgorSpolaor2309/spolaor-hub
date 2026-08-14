export type DiscountType = 'percentage' | 'fixed';

export interface CommercialItem {
  id: string;
  name: string;
  value: number;
  type: 'plan' | 'service';
  isIncluded?: boolean;
}

export interface CouponData {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  max_discount?: number;
  apply_to: 'all' | 'specific_plans' | 'specific_services';
  target_ids?: string[];
}

export function calculateCommercialTotal(
  basePlan: CommercialItem | null,
  extraServices: CommercialItem[],
  coupon: CouponData | null
) {
  const originalValue = (basePlan?.value ?? 0) + extraServices.filter(s => !s.isIncluded).reduce((acc, s) => acc + s.value, 0);
  let discountValue = 0;

  if (coupon) {
    if (coupon.apply_to === 'all') {
      discountValue = calculateDiscount(originalValue, coupon);
    } else {
      // Aplicar apenas aos itens específicos
      const applicableValue = [basePlan, ...extraServices]
        .filter(item => item && (
          (coupon.apply_to === 'specific_plans' && item.type === 'plan' && coupon.target_ids?.includes(item.id)) ||
          (coupon.apply_to === 'specific_services' && item.type === 'service' && coupon.target_ids?.includes(item.id))
        ))
        .reduce((acc, item) => acc + (item?.value ?? 0), 0);
      
      discountValue = calculateDiscount(applicableValue, coupon);
    }
  }

  // Desconto não pode ser maior que o valor original (máximo 100%)
  discountValue = Math.min(discountValue, originalValue);
  
  return {
    originalValue,
    discountValue,
    finalValue: Math.max(0, originalValue - discountValue)
  };
}

function calculateDiscount(baseValue: number, coupon: CouponData): number {
  if (coupon.discount_type === 'fixed') {
    return coupon.discount_value;
  } else {
    let discount = (baseValue * coupon.discount_value) / 100;
    if (coupon.max_discount && discount > coupon.max_discount) {
      discount = coupon.max_discount;
    }
    return discount;
  }
}
