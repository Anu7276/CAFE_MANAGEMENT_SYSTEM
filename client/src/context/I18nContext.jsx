import React, { createContext, useContext, useState, useEffect } from 'react';

const translations = {
  en: {
    cafeTitle: 'CAFÉ EMERALD',
    tableOrdering: 'Table Ordering',
    table: 'Table',
    all: 'All Items',
    coffee: 'Coffee',
    cold: 'Cold Beverages',
    snacks: 'Snacks & Bites',
    desserts: 'Desserts & Bakes',
    searchPlaceholder: 'Search coffee, smoothies, desserts...',
    vegOnly: 'Veg Only',
    addToCart: 'Add to Cart',
    soldOut: 'Sold Out',
    yourOrder: 'Your Order',
    cartEmpty: 'Your cart is empty. Select items to order.',
    reviewCheckout: 'Review & Checkout',
    openCart: 'Open Cart',
    viewCart: 'View Cart',
    itemsInCart: 'items in cart',
    specialNote: 'Special Note for Barista',
    subtotal: 'Subtotal',
    gstTax: 'GST (5% split 2.5% CGST + 2.5% SGST)',
    totalPayable: 'Total Payable',
    placeOrder: 'Place Order',
    liveStatus: 'Live Order Status',
    orderReceived: 'Received',
    orderReceivedDesc: 'The café has received your order',
    orderPreparing: 'Preparing',
    orderPreparingDesc: 'Handcrafted hot & fresh by our baristas',
    orderReady: 'Ready',
    orderReadyDesc: 'On its way to your table right now',
    orderServed: 'Served',
    orderServedDesc: 'Enjoy your food and coffee!',
    orderMore: 'Place Another Order',
    payUpi: 'Pay via UPI / Card',
    payCounter: 'Or pay with Cash at the counter',
    paidSettled: 'Payment Settled',
    noItemsFound: 'No delicious items found matching your filter.'
  },
  hi: {
    cafeTitle: 'कैफ़े एमराल्ड',
    tableOrdering: 'टेबल से सीधा ऑर्डर',
    table: 'टेबल',
    all: 'सभी व्यंजन',
    coffee: 'कॉफ़ी',
    cold: 'ठंडे पेय',
    snacks: 'नाश्ता और स्नैक्स',
    desserts: 'मीठा और बेकरी',
    searchPlaceholder: 'कॉफ़ी, स्मूदी या केक खोजें...',
    vegOnly: 'केवल शाकाहारी',
    addToCart: 'कार्ट में जोड़ें',
    soldOut: 'समाप्त (स्टॉक ख़त्म)',
    yourOrder: 'आपका ऑर्डर',
    cartEmpty: 'आपकी कार्ट खाली है। ऑर्डर करने के लिए आइटम चुनें।',
    reviewCheckout: 'ऑर्डर चेकआउट करें',
    openCart: 'कार्ट खोलें',
    viewCart: 'कार्ट देखें',
    itemsInCart: 'कार्ट में आइटम',
    specialNote: 'बारीस्ता के लिए विशेष निर्देश (नोट)',
    subtotal: 'उप-योग (सबटोटल)',
    gstTax: 'जीएसटी (5% टैक्स: 2.5% सीजीएसटी + 2.5% एसजीएसटी)',
    totalPayable: 'कुल देय राशि',
    placeOrder: 'ऑर्डर दर्ज करें',
    liveStatus: 'लाइव ऑर्डर स्थिति',
    orderReceived: 'स्वीकृत',
    orderReceivedDesc: 'कैफ़े को आपका ऑर्डर प्राप्त हो गया है',
    orderPreparing: 'तैयारी जारी है',
    orderPreparingDesc: 'बारीस्ता ताज़ा तैयार कर रहे हैं',
    orderReady: 'तैयार है',
    orderReadyDesc: 'आपकी टेबल पर लाया जा रहा है',
    orderServed: 'परोसा गया',
    orderServedDesc: 'अपने स्वादिष्ट भोजन और कॉफ़ी का आनंद लें!',
    orderMore: 'एक और ऑर्डर दें',
    payUpi: 'यूपीआई / कार्ड से भुगतान करें',
    payCounter: 'या काउंटर पर नकद भुगतान करें',
    paidSettled: 'भुगतान पूर्ण',
    noItemsFound: 'आपके खोज अनुसार कोई आइटम नहीं मिला।'
  },
  gu: {
    cafeTitle: 'કાફે એમરાલ્ડ',
    tableOrdering: 'ટેબલ પરથી સીધો ઓર્ડર',
    table: 'ટેબલ',
    all: 'બધી વાનગીઓ',
    coffee: 'કોફી',
    cold: 'ઠંડા પીણાં',
    snacks: 'નાસ્તો અને સ્નેક્સ',
    desserts: 'મીઠાઈ અને બેકરી',
    searchPlaceholder: 'કોફી, સ્મૂધી કે કેક શોધો...',
    vegOnly: 'માત્ર શાકાહારી',
    addToCart: 'કાર્ટમાં ઉમેરો',
    soldOut: 'સ્ટોક ખલાસ (સોલ્ડ આઉટ)',
    yourOrder: 'તમારો ઓર્ડર',
    cartEmpty: 'તમારી કાર્ટ ખાલી છે. ઓર્ડર કરવા માટે વાનગી પસંદ કરો.',
    reviewCheckout: 'ઓર્ડર ચેકઆઉટ કરો',
    openCart: 'કાર્ટ ખોલો',
    viewCart: 'કાર્ટ જુઓ',
    itemsInCart: 'કાર્ટમાં વસ્તુઓ',
    specialNote: 'બારિસ્ટા માટે ખાસ નોંધ',
    subtotal: 'કુલ કિંમત (સબટોટલ)',
    gstTax: 'જીએસટી (5% ટેક્સ: 2.5% CGST + 2.5% SGST)',
    totalPayable: 'ચૂકવવાપાત્ર રકમ',
    placeOrder: 'ઓર્ડર મૂકો',
    liveStatus: 'લાઈવ ઓર્ડર સ્થિતિ',
    orderReceived: 'મળ્યો',
    orderReceivedDesc: 'કાફેને તમારો ઓર્ડર મળ્યો છે',
    orderPreparing: 'તૈયાર થઈ રહ્યો છે',
    orderPreparingDesc: 'બારિસ્ટા તાજી કોફી બનાવી રહ્યા છે',
    orderReady: 'તૈયાર છે',
    orderReadyDesc: 'તમારા ટેબલ પર લાવવામાં આવી રહ્યો છે',
    orderServed: 'પીરસાઈ ગયું',
    orderServedDesc: 'તમારા સ્વાદિષ્ટ ભોજન અને કોફીની મજા માણો!',
    orderMore: 'બીજો ઓર્ડર આપો',
    payUpi: 'UPI / કાર્ડ દ્વારા ચૂકવો',
    payCounter: 'અથવા કાઉન્ટર પર રોકડ ચૂકવો',
    paidSettled: 'ચૂકવણી સફળ',
    noItemsFound: 'તમારા ફિલ્ટર મુજબ કોઈ વાનગી મળી નથી.'
  }
};

const I18nContext = createContext();

export const I18nProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('emerald_lang') || 'en';
  });

  const changeLanguage = (newLang) => {
    setLang(newLang);
    localStorage.setItem('emerald_lang', newLang);
  };

  const t = (key) => {
    return translations[lang]?.[key] || translations.en[key] || key;
  };

  return (
    <I18nContext.Provider value={{ lang, changeLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  return useContext(I18nContext) || {
    lang: 'en',
    changeLanguage: () => {},
    t: (k) => k
  };
};
