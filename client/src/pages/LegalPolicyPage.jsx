import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, FileText, RotateCcw, Building, Phone, Mail, MapPin } from 'lucide-react';

export default function LegalPolicyPage({ defaultTab = 'privacy' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [settings, setSettings] = useState({
    cafeName: 'Café Emerald',
    address: 'MG Road, Pune, Maharashtra 411001',
    phone: '+91 98765 43210',
    email: 'hello@cafeemerald.com',
    gstin: '',
    fssai: ''
  });

  useEffect(() => {
    if (location.pathname.includes('/terms')) setActiveTab('terms');
    else if (location.pathname.includes('/refund')) setActiveTab('refunds');
    else if (location.pathname.includes('/privacy')) setActiveTab('privacy');
  }, [location.pathname]);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(res => {
        if (res.data) {
          setSettings(prev => ({
            ...prev,
            cafeName: res.data.cafeName || prev.cafeName,
            address: res.data.address || prev.address,
            phone: res.data.phone || prev.phone,
            gstin: res.data.gstin || prev.gstin,
            fssai: res.data.fssai || prev.fssai
          }));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#071a12] text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#071a12]/95 backdrop-blur-md border-b border-white/10 px-4 py-4 sm:px-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-white/70 hover:text-white transition text-sm font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Menu
          </button>
          <span className="text-sm font-bold tracking-wider text-mintGreen uppercase">
            {settings.cafeName} Legal & Policies
          </span>
        </div>
      </header>

      {/* Hero & Navigation Tabs */}
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
            Legal & Customer Policies
          </h1>
          <p className="text-white/60 text-sm max-w-xl mx-auto">
            Official operational terms, customer privacy protection, and transparent payment cancellation policies in compliance with Indian consumer laws and Razorpay Merchant Guidelines.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex justify-center border-b border-white/10 mb-8 overflow-x-auto">
          <button
            onClick={() => { setActiveTab('privacy'); navigate('/privacy'); }}
            className={`flex items-center gap-2 px-6 py-3 font-bold text-sm border-b-2 transition whitespace-nowrap ${
              activeTab === 'privacy'
                ? 'border-mintGreen text-mintGreen'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Privacy Policy
          </button>
          <button
            onClick={() => { setActiveTab('terms'); navigate('/terms'); }}
            className={`flex items-center gap-2 px-6 py-3 font-bold text-sm border-b-2 transition whitespace-nowrap ${
              activeTab === 'terms'
                ? 'border-mintGreen text-mintGreen'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" /> Terms of Service
          </button>
          <button
            onClick={() => { setActiveTab('refunds'); navigate('/refunds'); }}
            className={`flex items-center gap-2 px-6 py-3 font-bold text-sm border-b-2 transition whitespace-nowrap ${
              activeTab === 'refunds'
                ? 'border-mintGreen text-mintGreen'
                : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            <RotateCcw className="w-4 h-4" /> Refund & Cancellation
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 text-white/80 space-y-6 leading-relaxed">
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-mintGreen" /> Privacy Policy
              </h2>
              <p className="text-xs text-white/50">Last updated: November 2026</p>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">1. Information We Collect</h3>
                <p>
                  At <strong>{settings.cafeName}</strong>, we collect minimal customer information strictly necessary to process your dine-in table orders and payments:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-white/70">
                  <li><strong>Dine-In Table Number:</strong> Encrypted with cryptographic table tokens to ensure authentic in-café ordering.</li>
                  <li><strong>Contact Details (Optional):</strong> Phone number or email if entered for digital receipts or SMS updates.</li>
                  <li><strong>Order History & Notes:</strong> Items selected, custom preparation instructions, and bill totals.</li>
                  <li><strong>Device Information:</strong> Technical telemetry (IP address, browser type, and essential cookies) used for session security and fraud prevention.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">2. Payment Security</h3>
                <p>
                  We do <strong>not</strong> collect, process, or store credit card, debit card, or UPI PIN numbers on our servers. All digital payments are processed through Razorpay's PCI-DSS Level 1 certified payment gateway via encrypted HTTPS connections.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">3. How We Use Your Data</h3>
                <p>
                  Your information is used solely to prepare and serve your orders, deliver digital bills, and resolve customer service inquiries. We never sell, rent, or trade your personal data to any third-party marketing entities.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">4. Data Retention</h3>
                <p>
                  Financial invoices and GST transaction logs are preserved in accordance with statutory requirements under the Indian Goods and Services Tax Act.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <FileText className="w-6 h-6 text-mintGreen" /> Terms & Conditions
              </h2>
              <p className="text-xs text-white/50">Last updated: November 2026</p>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">1. QR Dine-In Ordering</h3>
                <p>
                  Orders must be placed by scanning the authorized QR code located physically at your dining table. Tampering with table URLs, digital parameters, or attempting price modifications will result in immediate order cancellation and forfeiture of service.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">2. Pricing & Indian GST Taxes</h3>
                <p>
                  All menu items are priced in Indian Rupees (₹ INR). In compliance with Indian tax regulations, restaurant services are subject to 5% Total GST (2.5% CGST + 2.5% SGST under SAC Code 996331). The tax breakdown is itemized on every generated tax invoice.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">3. Kitchen Acceptance & Service</h3>
                <p>
                  Orders placed through the web application are received instantly by our Kitchen Display System (KDS). Once the kitchen marks an order as <em>Preparing</em>, ingredients are allocated and preparation begins.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">4. Right of Admission & Food Allergies</h3>
                <p>
                  Please communicate any severe food allergies to the floor manager prior to placing orders. Management reserves the right of admission and dining service.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'refunds' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <RotateCcw className="w-6 h-6 text-mintGreen" /> Refund & Cancellation Policy
              </h2>
              <p className="text-xs text-white/50">Last updated: November 2026</p>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">1. Order Cancellation by Customer</h3>
                <p>
                  Because food and beverages are freshly prepared upon receipt:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-white/70">
                  <li><strong>Before Preparation:</strong> You may request cancellation through café staff while the order is in <em>New</em> status for a 100% full refund.</li>
                  <li><strong>During / After Preparation:</strong> Once the kitchen status updates to <em>Preparing</em>, cancellations cannot be accepted as artisanal items are already crafted.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">2. Sold-Out or Unavailable Items</h3>
                <p>
                  If an item ordered is discovered to be unavailable or sold out, our staff will promptly notify you. You will be provided the option to substitute for an equivalent item or receive an immediate, full refund for the unavailable dish.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">3. Refund Processing Timelines</h3>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <span className="font-bold text-mintGreen text-sm block mb-1">Online UPI / Card (Razorpay)</span>
                    <p className="text-xs text-white/70">
                      Refunds are initiated via the Razorpay gateway within 24 hours and credited to your original bank account/UPI source within <strong>5 to 7 business days</strong> depending on your issuing bank.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <span className="font-bold text-mintGreen text-sm block mb-1">Cash / Counter Settlements</span>
                    <p className="text-xs text-white/70">
                      Approved cash refunds are returned immediately in cash at the counter by our duty cashier.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Business & Grievance Contact */}
          <div className="mt-8 pt-8 border-t border-white/10 text-xs text-white/60">
            <h4 className="font-bold text-sm text-white mb-3">Merchant & Grievance Contact Details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-mintGreen" />
                <span>{settings.cafeName} {settings.gstin ? `(GSTIN: ${settings.gstin})` : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-mintGreen" />
                <span>{settings.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-mintGreen" />
                <span>{settings.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-mintGreen" />
                <span>{settings.email || 'hello@cafeemerald.com'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
