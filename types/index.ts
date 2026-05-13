export interface Producto {
  id: string;
  nombre: string;
  sku: string | null;
  formato: string;
  stock: number;
  precio: number;
  fecha_ingreso: string;
  fecha_vencimiento: string | null;
  observaciones: string | null;
  created_at: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  nombre_contacto: string | null;
  telefono: string;
  direccion: string;
  tipo: TipoCliente;
  observaciones: string | null;
  muestra_entregada: boolean;
  activo_manual: boolean | null;
  created_at: string;
}

export type TipoCliente = 'carniceria' | 'distribuidor' | 'restaurante' | 'supermercado' | 'particular' | 'otro';

export type EstadoPedido = 'pendiente' | 'preparado' | 'entregado' | 'pagado';

export interface Pedido {
  id: string;
  cliente_id: string;
  fecha: string;
  total: number;
  direccion: string;
  telefono: string;
  estado: EstadoPedido;
  vendedor: string;
  observaciones: string | null;
  created_at: string;
  cliente?: Cliente;
  detalle?: DetallePedido[];
}

export interface DetallePedido {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  producto?: Producto;
}

export type EstadoProspecto = 'potencial' | 'contactado' | 'pendiente' | 'cerrado';

export interface Prospecto {
  id: string;
  nombre_local: string;
  nombre_contacto: string;
  telefono: string;
  direccion: string;
  tipo: TipoCliente;
  estado: EstadoProspecto;
  observaciones: string | null;
  muestra_entregada: boolean;
  created_at: string;
}
