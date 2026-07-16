import React, { useState, useEffect } from 'react';
import { Plus, Search, Printer, Activity } from 'lucide-react';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface Lot {
  id: number;
  lot_number: string;
  barcode: string;
  design_id: number;
  product_id: number;
  size: string;
  quantity: number;
  current_process: string;
  created_at: string;
}

export default function LotsPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLots();
  }, []);

  const fetchLots = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/lots');
      setLots(data.items || []);
    } catch (error) {
      console.error('Failed to fetch lots', error);
    } finally {
      setLoading(false);
    }
  };

  const createMockLot = async () => {
    try {
      await api.post('/lots', {
        design_id: 1,
        product_id: 1,
        size: 'L',
        quantity: 100
      });
      fetchLots();
    } catch (error) {
      console.error('Failed to create lot', error);
      alert("Failed to create lot. Please ensure Product ID 1 and Design ID 1 exist.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lot Management</h2>
          <p className="text-sm text-muted-foreground">Create and track production batches.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={createMockLot}>
            <Plus className="mr-2 h-4 w-4" />
            Create Lot (Test)
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search lots..." 
              className="pl-9 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Lot Number</th>
                <th className="px-6 py-3 font-medium">Barcode UUID</th>
                <th className="px-6 py-3 font-medium">Size & Qty</th>
                <th className="px-6 py-3 font-medium">Stage</th>
                <th className="px-6 py-3 font-medium">Created Date</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading...</td>
                </tr>
              ) : lots.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No lots found. Create one to get started.</td>
                </tr>
              ) : (
                lots.map((lot) => (
                  <tr key={lot.id} className="border-b border-border hover:bg-muted/30">
                    <td className="px-6 py-4 font-medium">{lot.lot_number}</td>
                    <td className="px-6 py-4 font-mono text-xs">{lot.barcode}</td>
                    <td className="px-6 py-4">{lot.size} / {lot.quantity} pcs</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                        {lot.current_process}
                      </span>
                    </td>
                    <td className="px-6 py-4">{new Date(lot.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground">
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground">
                        <Activity className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
