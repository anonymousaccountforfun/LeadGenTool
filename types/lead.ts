export interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message: string;
  source: string;
  createdAt: string;
}

export interface LeadFormData {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message: string;
}

export interface LeadFormState {
  success: boolean;
  message: string;
  errors?: {
    name?: string[];
    email?: string[];
    phone?: string[];
    company?: string[];
    message?: string[];
  };
}
