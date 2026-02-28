import { describe, it } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import AnalyticsDashboard from './AnalyticsDashboard';

describe('AnalyticsDashboard', () => {
    it('renders without crashing', () => {
        try {
            render(<AnalyticsDashboard />);
        } catch (e) {
            console.error(e);
            throw e;
        }
    });
});
