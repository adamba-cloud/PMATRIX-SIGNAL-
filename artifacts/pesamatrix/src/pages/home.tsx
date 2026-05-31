import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ActivitySquare, ArrowRight, Target, Zap, Shield, ChevronRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2 text-green-500">
          <ActivitySquare className="w-6 h-6" />
          <span className="font-bold text-xl tracking-tight">PESAMATRIX</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
            Sign In
          </Link>
          <Link href="/register">
            <Button className="bg-green-600 hover:bg-green-500 text-white border-0">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 relative overflow-hidden">
        {/* Background elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-green-500/10 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-sm font-medium text-green-400 mb-8">
          <span className="flex h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
          Professional Trading Signals
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white max-w-4xl mb-6">
          Execute with <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600">Surgical Precision</span>
        </h1>
        
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10">
          High-probability Forex and Crypto signals delivered directly to your dashboard. Built for serious traders in East Africa who demand data, speed, and results.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center max-w-md">
          <Link href="/register" className="w-full">
            <Button size="lg" className="w-full bg-green-600 hover:bg-green-500 text-white border-0 h-14 text-lg">
              Start Trading Now <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto w-full text-left">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Target className="w-24 h-24 text-green-500" />
            </div>
            <Target className="w-8 h-8 text-green-500 mb-4 relative z-10" />
            <h3 className="text-lg font-bold text-white mb-2 relative z-10">High Win Rate</h3>
            <p className="text-slate-400 text-sm relative z-10">Our proprietary algorithms and expert analysts target an 80%+ win rate across major pairs.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Zap className="w-24 h-24 text-green-500" />
            </div>
            <Zap className="w-8 h-8 text-green-500 mb-4 relative z-10" />
            <h3 className="text-lg font-bold text-white mb-2 relative z-10">Instant Delivery</h3>
            <p className="text-slate-400 text-sm relative z-10">Zero latency signal distribution. Enter the market at the exact right moment with full SL/TP parameters.</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Shield className="w-24 h-24 text-green-500" />
            </div>
            <Shield className="w-8 h-8 text-green-500 mb-4 relative z-10" />
            <h3 className="text-lg font-bold text-white mb-2 relative z-10">Risk Managed</h3>
            <p className="text-slate-400 text-sm relative z-10">Every signal comes with calculated risk parameters. Protect your capital while maximizing upside.</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 px-6 text-center text-slate-500 text-sm bg-slate-950">
        <div className="flex justify-center items-center gap-6 mb-4">
          <span>Phone: +254781585319</span>
          <span>•</span>
          <span>Support/WhatsApp: +254717434943</span>
        </div>
        <p>© {new Date().getFullYear()} PESAMATRIX SIGNAL. All rights reserved.</p>
      </footer>
    </div>
  );
}