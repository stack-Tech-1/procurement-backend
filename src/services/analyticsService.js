// backend/src/services/analyticsService.js
import prisma from '../config/prismaClient.js';

class AnalyticsService {
  
  // Predictive spend forecasting
  async forecastSpend(timeRange = 'quarter') {
    try {
      console.log('🔮 Generating spend forecast for:', timeRange);
      const historicalData = await this.getHistoricalSpendData(timeRange);
      
      if (historicalData.length === 0) {
        return {
          forecast: 0,
          confidence: 0,
          historicalData: [],
          trend: 'stable',
          message: 'Insufficient historical data for forecasting'
        };
      }

      // Simple linear regression forecasting
      const forecast = this.calculateForecast(historicalData);
      const trend = this.analyzeTrend(historicalData);
      
      console.log('✅ Forecast generated:', { forecast, trend, dataPoints: historicalData.length });
      
      return {
        forecast: Math.round(forecast),
        confidence: historicalData.length > 5 ? 0.85 : 0.65,
        historicalData: historicalData.map(item => ({
          date: item.createdAt,
          spend: item.contractValue,
          vendor: item.vendor?.companyLegalName
        })),
        trend,
        dataPoints: historicalData.length
      };
    } catch (error) {
      console.error('❌ Forecast calculation error:', error);
      throw new Error('Failed to generate spend forecast: ' + error.message);
    }
  }

  // Advanced spend analysis
  async analyzeSpend(category = 'all', vendorId = null, projectId = null) {
    try {
      console.log('📊 Analyzing spend data:', { category, vendorId, projectId });
      const whereClause = this.buildSpendWhereClause(category, vendorId, projectId);
      
      const spendData = await prisma.contract.aggregate({
        where: whereClause,
        _sum: {
          contractValue: true
        },
        _avg: {
          contractValue: true
        },
        _count: {
          id: true
        }
      });

      const totalSpend = spendData._sum.contractValue || 0;
      
      const [categoryBreakdown, vendorBreakdown, monthlyTrend] = await Promise.all([
        this.getCategoryBreakdown(whereClause),
        this.getVendorBreakdown(whereClause),
        this.getMonthlyTrend(whereClause)
      ]);

      // Calculate percentages
      const categoryBreakdownWithPercentages = categoryBreakdown.map(item => ({
        ...item,
        percentage: totalSpend > 0 ? (item.spend / totalSpend) * 100 : 0
      }));

      const savingsOpportunities = await this.identifySavingsOpportunities(categoryBreakdownWithPercentages);

      console.log('✅ Spend analysis completed:', { 
        totalSpend, 
        contractCount: spendData._count.id,
        categories: categoryBreakdown.length,
        vendors: vendorBreakdown.length
      });

      return {
        summary: {
          totalSpend,
          averageContractValue: spendData._avg.contractValue || 0,
          contractCount: spendData._count.id || 0,
          dateRange: await this.getAnalysisDateRange()
        },
        categoryBreakdown: categoryBreakdownWithPercentages,
        vendorBreakdown: vendorBreakdown.slice(0, 10), // Top 10 vendors
        monthlyTrend: monthlyTrend.slice(-12), // Last 12 months
        savingsOpportunities
      };
    } catch (error) {
      console.error('❌ Spend analysis error:', error);
      throw new Error('Failed to analyze spend data: ' + error.message);
    }
  }

  // Vendor performance benchmarking
  async benchmarkVendors(category = null) {
    try {
      console.log('🏆 Benchmarking vendors for category:', category || 'all');
      
      const whereClause = category ? { 
        categories: {
          some: {
            category: {
              name: category
            }
          }
        }
      } : {};

      const vendorPerformance = await prisma.vendor.findMany({
        where: whereClause,
        include: {
          categories: {
            include: {
              category: true
            }
          },
          contracts: {
            select: {
              contractValue: true,
              status: true,
              createdAt: true
            }
          },
          submissions: {
            include: {
              evaluations: {
                select: {
                  totalScore: true
                }
              }
            }
          },
          documents: {
            where: {
              isValid: true
            },
            select: {
              docType: true
            }
          }
        }
      });

      console.log(`📈 Found ${vendorPerformance.length} vendors for benchmarking`);

      const benchmarks = vendorPerformance.map(vendor => {
        const totalContractValue = vendor.contracts.reduce((sum, contract) => sum + (contract.contractValue || 0), 0);
        const activeContracts = vendor.contracts.filter(c => c.status === 'ACTIVE').length;
        const averageScore = this.calculateAverageEvaluationScore(vendor.submissions);
        const validDocuments = vendor.documents.length;

        return {
          id: vendor.id,
          name: vendor.companyLegalName,
          qualificationScore: vendor.qualificationScore || 0,
          vendorClass: vendor.vendorClass || 'D',
          totalContractValue,
          contractCount: vendor.contracts.length,
          activeContracts,
          averageEvaluationScore: averageScore,
          validDocuments,
          performanceTier: this.assignPerformanceTier(vendor),
          improvementAreas: this.identifyImprovementAreas(vendor),
          categories: vendor.categories.map(vc => vc.category.name)
        };
      }).filter(vendor => vendor.qualificationScore > 0); // Only vendors with scores

      const benchmarksWithPercentiles = this.calculateBenchmarkPercentiles(benchmarks);

      console.log('✅ Vendor benchmarking completed');

      return {
        benchmarks: benchmarksWithPercentiles,
        summary: {
          totalVendors: benchmarks.length,
          averageScore: benchmarks.reduce((sum, v) => sum + v.qualificationScore, 0) / benchmarks.length,
          topPerformers: benchmarks.filter(v => v.performanceTier === 'A').length,
          needsImprovement: benchmarks.filter(v => v.performanceTier === 'D').length
        }
      };
    } catch (error) {
      console.error('❌ Vendor benchmarking error:', error);
      throw new Error('Failed to benchmark vendors: ' + error.message);
    }
  }

  // Real-time KPI calculations
  async calculateKPIs(timeRange = 'month') {
    try {
      console.log('📈 Calculating KPIs for:', timeRange);
      const dateRange = this.getDateRange(timeRange);
      
      const [
        totalSpend,
        vendorCount,
        contractCount,
        activeVendors,
        costSavings
      ] = await Promise.all([
        this.calculateTotalSpend(dateRange),
        this.countTotalVendors(),
        this.countActiveContracts(dateRange),
        this.countActiveVendors(),
        this.calculateCostSavings(dateRange)
      ]);

      const budgetUtilization = await this.calculateBudgetUtilization(totalSpend);
      const approvalEfficiency = await this.calculateApprovalEfficiency(dateRange);
      const averageResponseTime = await this.calculateAverageResponseTime(dateRange);
      const vendorSatisfaction = await this.calculateVendorSatisfaction();
      const contractCompliance = await this.calculateContractCompliance();
      const onTimeDelivery = await this.calculateOnTimeDelivery(dateRange);

      const kpis = {
        financial: {
          totalSpend,
          budgetUtilization,
          costSavings,
          savingsRate: totalSpend > 0 ? (costSavings / totalSpend) * 100 : 0,
          forecast: await this.getQuickForecast(totalSpend)
        },
        operational: {
          vendorCount,
          activeVendors,
          contractCount,
          approvalEfficiency,
          averageResponseTime,
          documentCompliance: await this.calculateDocumentCompliance()
        },
        quality: {
          vendorSatisfaction,
          contractCompliance,
          onTimeDelivery,
          qualificationRate: await this.calculateQualificationRate()
        }
      };

      console.log('✅ KPIs calculated successfully');
      return kpis;
    } catch (error) {
      console.error('❌ KPI calculation error:', error);
      throw new Error('Failed to calculate KPIs: ' + error.message);
    }
  }

  // PRIVATE HELPER METHODS

  async getHistoricalSpendData(timeRange) {
    const dateRange = this.getDateRange(timeRange);
    
    return await prisma.contract.findMany({
      where: {
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end
        },
        contractValue: {
          gt: 0
        }
      },
      include: {
        vendor: {
          select: {
            companyLegalName: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
  }

  calculateForecast(historicalData) {
    if (historicalData.length < 2) {
      return historicalData[0]?.contractValue || 0;
    }

    // Simple linear regression
    const n = historicalData.length;
    const x = historicalData.map((_, i) => i);
    const y = historicalData.map(item => item.contractValue);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Forecast next period
    return Math.max(0, slope * n + intercept);
  }

  analyzeTrend(historicalData) {
    if (historicalData.length < 2) return 'stable';
    
    const firstValue = historicalData[0].contractValue;
    const lastValue = historicalData[historicalData.length - 1].contractValue;
    
    if (firstValue === 0) return 'rising'; // Avoid division by zero
    
    const percentageChange = ((lastValue - firstValue) / firstValue) * 100;
    
    if (percentageChange > 15) return 'rising';
    if (percentageChange < -15) return 'declining';
    return 'stable';
  }

  buildSpendWhereClause(category, vendorId, projectId) {
    const where = {};
    
    if (category !== 'all') {
      where.vendor = {
        categories: {
          some: {
            category: {
              name: category
            }
          }
        }
      };
    }
    
    if (vendorId) {
      where.vendorId = parseInt(vendorId);
    }
    
    // Add status filter to only include active contracts
    where.status = 'ACTIVE';
    
    return where;
  }

  async getCategoryBreakdown(whereClause) {
    const contracts = await prisma.contract.findMany({
      where: whereClause,
      include: {
        vendor: {
          include: {
            categories: {
              include: {
                category: true
              }
            }
          }
        }
      }
    });

    const breakdown = {};
    contracts.forEach(contract => {
      if (contract.vendor?.categories) {
        contract.vendor.categories.forEach(vendorCategory => {
          const categoryName = vendorCategory.category.name;
          if (!breakdown[categoryName]) {
            breakdown[categoryName] = 0;
          }
          breakdown[categoryName] += contract.contractValue || 0;
        });
      }
    });

    return Object.entries(breakdown).map(([category, spend]) => ({
      category,
      spend
    }));
  }

  async getVendorBreakdown(whereClause) {
    const vendors = await prisma.vendor.findMany({
      where: whereClause.vendor ? whereClause.vendor : {},
      include: {
        contracts: {
          where: whereClause
        }
      }
    });

    return vendors.map(vendor => ({
      vendorId: vendor.id,
      vendorName: vendor.companyLegalName,
      spend: vendor.contracts.reduce((sum, contract) => sum + (contract.contractValue || 0), 0),
      contractCount: vendor.contracts.length,
      vendorClass: vendor.vendorClass
    })).sort((a, b) => b.spend - a.spend);
  }

  async getMonthlyTrend(whereClause) {
    const contracts = await prisma.contract.findMany({
      where: whereClause,
      select: {
        contractValue: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    const monthlyData = {};
    contracts.forEach(contract => {
      const monthKey = contract.createdAt.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = 0;
      }
      monthlyData[monthKey] += contract.contractValue || 0;
    });

    return Object.entries(monthlyData).map(([month, spend]) => ({
      month,
      spend
    }));
  }

  async identifySavingsOpportunities(categoryBreakdown) {
    if (categoryBreakdown.length === 0) return [];

    const sortedCategories = [...categoryBreakdown].sort((a, b) => b.spend - a.spend);
    
    return sortedCategories.slice(0, 3).map(category => ({
      category: category.category,
      currentSpend: category.spend,
      potentialSavings: Math.round(category.spend * 0.15), // Assume 15% savings potential
      recommendation: `Negotiate better rates with top vendors in ${category.category}`,
      priority: category.spend > 1000000 ? 'high' : 'medium'
    }));
  }

  calculateAverageEvaluationScore(submissions) {
    const evaluations = submissions.flatMap(sub => sub.evaluations || []);
    if (evaluations.length === 0) return 0;
    
    const totalScore = evaluations.reduce((sum, evaluation) => sum + (evaluation.totalScore || 0), 0);
    return Math.round((totalScore / evaluations.length) * 10) / 10; // Round to 1 decimal
  }

  assignPerformanceTier(vendor) {
    const score = vendor.qualificationScore || 0;
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    return 'D';
  }

  identifyImprovementAreas(vendor) {
    const areas = [];
    if ((vendor.qualificationScore || 0) < 70) areas.push('Qualification Documents');
    if (vendor.contracts.length === 0) areas.push('Contract Awards');
    if (!vendor.vendorClass || vendor.vendorClass === 'D') areas.push('Performance Score');
    
    // Check document compliance
    const requiredDocs = ['COMMERCIAL_REGISTRATION', 'VAT_CERTIFICATE'];
    const existingDocs = vendor.documents.map(d => d.docType);
    const missingDocs = requiredDocs.filter(doc => !existingDocs.includes(doc));
    
    if (missingDocs.length > 0) {
      areas.push('Missing Required Documents');
    }
    
    return areas.slice(0, 3); // Max 3 areas
  }

  calculateBenchmarkPercentiles(benchmarks) {
    const scores = benchmarks.map(b => b.qualificationScore).filter(s => s > 0);
    if (scores.length === 0) return benchmarks;

    scores.sort((a, b) => a - b);
    
    return benchmarks.map(benchmark => ({
      ...benchmark,
      percentile: Math.round(this.calculatePercentile(scores, benchmark.qualificationScore))
    }));
  }

  calculatePercentile(sortedScores, score) {
    const count = sortedScores.length;
    const below = sortedScores.filter(s => s < score).length;
    return (below / count) * 100;
  }

  getDateRange(timeRange) {
    const now = new Date();
    const start = new Date();
    
    switch (timeRange) {
      case 'week':
        start.setDate(now.getDate() - 7);
        break;
      case 'month':
        start.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        start.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        start.setFullYear(now.getFullYear() - 1);
        break;
      default:
        start.setMonth(now.getMonth() - 1);
    }
    
    return { start, end: now };
  }

  async getAnalysisDateRange() {
    const firstContract = await prisma.contract.findFirst({
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        createdAt: true
      }
    });

    return {
      start: firstContract?.createdAt || new Date(),
      end: new Date()
    };
  }

  // KPI Calculation Methods
  async calculateTotalSpend(dateRange) {
    const result = await prisma.contract.aggregate({
      where: {
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end
        },
        status: 'ACTIVE'
      },
      _sum: {
        contractValue: true
      }
    });
    return result._sum.contractValue || 0;
  }

  async countTotalVendors() {
    return await prisma.vendor.count();
  }

  async countActiveVendors() {
    return await prisma.vendor.count({
      where: {
        status: 'APPROVED'
      }
    });
  }

  async countActiveContracts(dateRange) {
    return await prisma.contract.count({
      where: {
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end
        },
        status: 'ACTIVE'
      }
    });
  }

  async calculateApprovalEfficiency(dateRange) {
    // Simple implementation - count approvals within SLA
    const totalApprovals = await prisma.approval.count({
      where: {
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end
        }
      }
    });

    const efficientApprovals = await prisma.approval.count({
      where: {
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end
        },
        slaBreached: false
      }
    });

    return totalApprovals > 0 ? Math.round((efficientApprovals / totalApprovals) * 100) : 100;
  }

  async calculateCostSavings(dateRange) {
    // Placeholder - in real implementation, calculate actual savings
    const totalSpend = await this.calculateTotalSpend(dateRange);
    return Math.round(totalSpend * 0.12); // Assume 12% savings
  }

  async calculateBudgetUtilization(totalSpend) {
    // Placeholder budget - in real implementation, use actual budget data
    const annualBudget = 50000000; // 50M annual budget
    const monthlyBudget = annualBudget / 12;
    const utilization = (totalSpend / monthlyBudget) * 100;
    return Math.min(Math.round(utilization), 100); // Cap at 100%
  }

  async calculateAverageResponseTime(dateRange) {
    // Placeholder - in real implementation, calculate actual response times
    return 2.3; // days
  }

  async calculateVendorSatisfaction() {
    // Placeholder - in real implementation, use survey data
    return 89; // percentage
  }

  async calculateContractCompliance() {
    // Placeholder - in real implementation, check contract terms compliance
    return 94; // percentage
  }

  async calculateOnTimeDelivery(dateRange) {
    // Placeholder - in real implementation, track actual delivery dates
    return 78; // percentage
  }

  async calculateDocumentCompliance() {
    const totalVendors = await this.countActiveVendors();
    const compliantVendors = await prisma.vendor.count({
      where: {
        status: 'APPROVED',
        documents: {
          some: {
            docType: 'COMMERCIAL_REGISTRATION',
            isValid: true
          }
        }
      }
    });

    return totalVendors > 0 ? Math.round((compliantVendors / totalVendors) * 100) : 100;
  }

  async calculateQualificationRate() {
    const totalVendors = await this.countTotalVendors();
    const qualifiedVendors = await this.countActiveVendors();
    
    return totalVendors > 0 ? Math.round((qualifiedVendors / totalVendors) * 100) : 0;
  }

  async getQuickForecast(currentSpend) {
    // Simple forecast based on current spend
    return Math.round(currentSpend * 1.15); // 15% growth
  }
}

export default new AnalyticsService();