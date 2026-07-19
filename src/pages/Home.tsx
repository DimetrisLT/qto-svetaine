import CadCursor from '@/landing/components/CadCursor';
import Marquee from '@/landing/components/Marquee';
import Hero from '@/landing/sections/Hero';
import HowItWorks from '@/landing/sections/HowItWorks';
import Features from '@/landing/sections/Features';
import SelfCheckDemo from '@/landing/sections/SelfCheckDemo';
import Ziniarastis from '@/landing/sections/Ziniarastis';
import Footer from '@/landing/sections/Footer';
import '@/landing.css';

export default function Home() {
  return (
    <div className="landing-root relative min-h-screen bg-background">
      <CadCursor />
      <Hero />
      <Marquee />
      <HowItWorks />
      <Features />
      <SelfCheckDemo />
      <Ziniarastis />
      <Footer />
    </div>
  );
}
